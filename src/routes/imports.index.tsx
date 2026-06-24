import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { useState } from "react";
import { useDropzone } from "react-dropzone";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Upload, FileSpreadsheet, Loader2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";


export const Route = createFileRoute("/imports/")({
  head: () => ({ meta: [{ title: "استيراد ملفات Excel" }] }),
  component: () => <AppShell><Imports /></AppShell>,
});

type RowMap = Record<string, any>;
interface Preview {
  rows: RowMap[];
  toInsert: number;
  toUpdate: number;
  errors: string[];
  sheetsInfo?: {
    sheetName: string;
    gradeName: string | null;
    className: string | null;
    rowCount: number;
  }[];
  parserVersion?: string;
  rawTotal?: number;
  uniqueStudents?: number;
}

const COL_ALIASES: Record<string, string[]> = {
  full_name: ["الاسم","اسم الطالب","name","student_name","fullname"],
  student_code: ["كود","الكود","كود الطالب","student_code","code"],
  national_id: ["الرقم القومي للطالب","الرقم القومي","رقم قومي","national_id","nid"],
  birth_date: ["تاريخ الميلاد","birth_date","dob"],
  birth_place: ["محل الميلاد","birth_place"],
  gender: ["النوع","gender"],
  religion: ["الديانة","religion"],
  mother_name: ["اسم الأم","mother_name"],
  mother_national_id: ["الرقم القومى للام","الرقم القومي للأم","mother_national_id"],
  father_national_id: ["الرقم القومي للأب","الرقم القومى للاب","father_national_id"],
  guardian_job: ["وظيفة ولي الأمر","guardian_job"],
  guardian_name: ["اسم ولي الأمر","guardian_name"],
  address: ["العنوان","address"],
  phone: ["رقم الموبايل","الهاتف","phone","mobile"],
  first_installment: ["القسط الأول","قسط اول","first_installment"],
  second_installment: ["القسط الثاني","قسط ثاني","second_installment"],
  previous_installments: ["أقساط سابقة","أقساط سنوات سابقة","previous_installments"],
  other_fees: ["رسوم أخرى","رسوم اخرى","other_fees"],
};

function parseBirthDate(v: unknown): string | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") {
    // Excel serial date
    const d = new Date(Math.round((v - 25569) * 86400 * 1000));
    return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  // Try M/D/YYYY or D/M/YYYY
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (m) {
    const a = Number(m[1]), b = Number(m[2]), y = Number(m[3].length === 2 ? "20" + m[3] : m[3]);
    // Assume M/D/Y as in sample (12/20/2020)
    const month = a > 12 ? b : a;
    const day = a > 12 ? a : b;
    const d = new Date(y, month - 1, day);
    return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

function sanitizeString(s: string): string {
  if (!s) return "";
  return s
    .toString()
    // Remove zero-width spaces, RTL/LTR marks, control chars, and non-breaking spaces
    .replace(/[\u200B-\u200D\uFEFF\u200E\u200F\u202A-\u202E\u00A0]/g, "")
    // Trim and lowercase
    .trim()
    .toLowerCase()
    // Normalize Hamzas: أ, إ, آ => ا
    .replace(/[أإآ]/g, "ا")
    // Normalize Alef Maksura: ى => ي
    .replace(/ى/g, "ي")
    // Normalize Teh Marbuta: ة => ه
    .replace(/ة/g, "ه")
    // Strip Arabic Tashkeel (diacritics)
    .replace(/[\u064B-\u0652]/g, "");
}

function normalize(row: RowMap): RowMap {
  const out: RowMap = {};
  for (const [field, aliases] of Object.entries(COL_ALIASES)) {
    for (const key of Object.keys(row)) {
      const sanitizedKey = sanitizeString(key);
      if (aliases.some(alias => sanitizeString(alias) === sanitizedKey)) {
        out[field] = row[key];
        break;
      }
    }
  }
  return out;
}

// Import parser version (update when changing parsing/matching logic)
const IMPORT_PARSER_VERSION = "2026-06-24_v2";

function findGradeAndClass(
  sheetName: string,
  dbGrades: { id: string; name: string; level: number | null }[],
  dbClasses: { id: string; name: string; grade_id: string | null }[]
) {
  // Pre-clean sheet name: remove parenthesized counts, arrows, and noisy tokens
    // If the sheet includes an arrow (e.g. "k1 ← KG1"), prefer the right-hand segment (the canonical name)
      let sheetForMatch = String(sheetName ?? "");
      // If sheet looks like "(30 طالب) G2 ← KG2" (count + arrow), treat it as noisy and skip entirely
      if (/\(\s*\d+\s*طالب\s*\).*←|←.*\(\s*\d+\s*طالب\s*\)/i.test(sheetForMatch)) {
        return { gradeId: null, classId: null, gradeName: null, className: null, isNoisy: true };
      }
      if (/←|→|<-|->|–|—/.test(sheetForMatch)) {
          const parts = sheetForMatch.split(/←|→|<-|->|–|—/);
          sheetForMatch = parts[parts.length - 1] || sheetForMatch;
      }

    // Pre-clean sheet name: remove parenthesized counts and noisy tokens
    let cleanedSheetName = String(sheetForMatch ?? "");
    // Remove anything inside parentheses (e.g. "(51 طالب)")
    cleanedSheetName = cleanedSheetName.replace(/\(.*?\)/g, " ");
    // Remove common noise words that should not affect grade matching
    cleanedSheetName = cleanedSheetName.replace(/\b(list|mob|id)\b/gi, " ");
    cleanedSheetName = cleanedSheetName.replace(/\s+/g, " ").trim();
  const cleanSheet = sanitizeString(cleanedSheetName);

  // Helper to present KG labels for kindergarten levels
  const displayGradeNameFor = (g: { id: string; name: string; level: number | null } | null) => {
    if (!g) return null;
    if (g.level === 1 || g.level === 2) return `KG${g.level}`;
    return g.name;
  };

  // Prefer explicit KG tokens (e.g. "KG1", "kg2", "← KG1") — treat these as authoritative
  const explicitKgMatch = cleanedSheetName.match(/\bkg\s*([12])\b/i) || cleanedSheetName.match(/kg([12])/i);
  if (explicitKgMatch) {
    const kgNum = Number(explicitKgMatch[1]);
    const desiredLevel = kgNum; // KG1 -> level 1, KG2 -> level 2
    const gradeByLevel = dbGrades.find(g => g.level === desiredLevel);
    if (gradeByLevel) {
      return { gradeId: gradeByLevel.id, classId: null, gradeName: `KG${desiredLevel}`, className: null, isNoisy: false };
    }
  }

  // If the sheet name contains an explicit grade number (capture optional prefix like g/grade/kg/k)
  const explicitNumMatch = cleanedSheetName.match(/\b(?:(g|grade|kg|k)\s*)?(\d{1,2})\b/i);
  if (explicitNumMatch) {
    const prefix = explicitNumMatch[1] ? String(explicitNumMatch[1]).toLowerCase() : null;
    const num = Number(explicitNumMatch[2]);
    if (!Number.isNaN(num) && num >= 1 && num <= 12) {
      let desiredLevel: number | null = null;
      if (prefix && (prefix.startsWith("k"))) {
        // explicit KG/k prefix
        desiredLevel = num; // 1 or 2
      } else if (prefix && (prefix.startsWith("g") || prefix === "grade")) {
        // explicit G/grade prefix: G1 -> stored level 3
        desiredLevel = num + 2;
      } else {
        // No prefix: fall back to heuristic: 1-2 -> KG, else -> grade num+2
        desiredLevel = num <= 2 ? num : num + 2;
      }

      if (desiredLevel !== null) {
        const gradeByLevel = dbGrades.find(g => g.level === desiredLevel);
        if (gradeByLevel) {
          // Prefer exact class match under this grade if the sheet contains a class letter
          const classLetterMatch = cleanedSheetName.match(/\b([A-Da-dا-د])\b/);
          if (classLetterMatch) {
            const letter = sanitizeString(classLetterMatch[1]);
            const cls = dbClasses.find(c => c.grade_id === gradeByLevel.id && sanitizeString(c.name) === letter);
            if (cls) {
              return { gradeId: gradeByLevel.id, classId: cls.id, gradeName: displayGradeNameFor(gradeByLevel), className: cls.name, isNoisy: false };
            }
          }
          return { gradeId: gradeByLevel.id, classId: null, gradeName: displayGradeNameFor(gradeByLevel), className: null, isNoisy: false };
        }
      }
    }
  }

  // Exact matching class
  let exactClass = dbClasses.find(c => sanitizeString(c.name) === cleanSheet);
  if (exactClass) {
    const grade = dbGrades.find(g => g.id === exactClass.grade_id);
    return {
      gradeId: exactClass.grade_id,
      classId: exactClass.id,
      gradeName: grade?.name ?? null,
      className: exactClass.name,
      isNoisy: false
    };
  }

  // Exact matching grade
  let exactGrade = dbGrades.find(g => sanitizeString(g.name) === cleanSheet);
  if (exactGrade) {
    return {
      gradeId: exactGrade.id,
      classId: null,
      gradeName: exactGrade.name,
      className: null
      ,
      isNoisy: false
    };
  }

  // Calculate matching scores for all grades
  let bestGrade: typeof dbGrades[0] | null = null;
  let highestGradeScore = 0;

  for (const grade of dbGrades) {
    const cleanGrade = sanitizeString(grade.name);
    const cleanGradeShort = cleanGrade
      .replace(/الابتدائي/g, "")
      .replace(/الاعدادي/g, "")
      .replace(/الثانوي/g, "")
      .trim();

    let score = 0;

    // Substring match
    if (cleanSheet.includes(cleanGrade)) {
      score += 15;
    } else if (cleanGrade.includes(cleanSheet)) {
      score += 10;
    } else if (cleanSheet.includes(cleanGradeShort)) {
      score += 8;
    } else if (cleanGradeShort.includes(cleanSheet)) {
      score += 6;
    }

    // Word matches
    const sheetWords = cleanSheet.split(/[\s\-\/_]+/).filter(w => w.length > 1);
    const gradeWords = cleanGrade.split(/[\s\-\/_]+/).filter(w => w.length > 1);
    
    let wordMatches = 0;
    for (const sw of sheetWords) {
      if (gradeWords.includes(sw)) {
        wordMatches++;
      }
    }
    score += wordMatches * 3;

    // Level map indicators (supporting K1, K2, G1 => G12)
    if (grade.level !== null) {
      const levelMap: Record<number, string[]> = {
        1: ["k1", "كي جي 1", "الاول رياض", "روضة اول"],
        2: ["k2", "كي جي 2", "الثاني رياض", "روضة ثاني"],
        3: ["g1", "grade1", "grade 1", "1", "الاول", "اولى"],
        4: ["g2", "grade2", "grade 2", "2", "الثاني", "تانية"],
        5: ["g3", "grade3", "grade 3", "3", "الثالث", "تالتة"],
        6: ["g4", "grade4", "grade 4", "4", "الرابع", "رابعة"],
        7: ["g5", "grade5", "grade 5", "5", "الخامس", "خامسة"],
        8: ["g6", "grade6", "grade 6", "6", "السادس", "ستة", "ساتة"],
        9: ["g7", "grade7", "grade 7", "7", "السابع", "الاول الاعدادي", "اعدادي اول"],
        10: ["g8", "grade8", "grade 8", "8", "الثامن", "الثاني الاعدادي", "اعدادي ثاني"],
        11: ["g9", "grade9", "grade 9", "9", "التاسع", "الثالث الاعدادي", "اعدادي ثالث"],
        12: ["g10", "grade10", "grade 10", "10", "الاول الثانوي", "ثانوي اول"],
        13: ["g11", "grade11", "grade 11", "11", "الثاني الثانوي", "ثانوي ثاني"],
        14: ["g12", "grade12", "grade 12", "12", "الثالث الثانوي", "ثانوي ثالث"],
      };
      
      const indicators = levelMap[grade.level] || [];
      if (indicators.some(ind => cleanSheet.includes(sanitizeString(ind)))) {
        score += 5;
      }
    }

    if (score > highestGradeScore) {
      highestGradeScore = score;
      bestGrade = grade;
    }
  }

  const matchedGrade = highestGradeScore >= 4 ? bestGrade : null;

  if (matchedGrade) {
    const classesUnderGrade = dbClasses.filter(c => c.grade_id === matchedGrade.id);
    let bestClass: typeof dbClasses[0] | null = null;
    let highestClassScore = 0;

    for (const cls of classesUnderGrade) {
      const cleanCls = sanitizeString(cls.name);
      
      // Support matching letter classes whether they are in English or Arabic in the Excel sheet
      const clsVariations = [cleanCls];
      if (cleanCls === "ا") clsVariations.push("a");
      if (cleanCls === "ب") clsVariations.push("b");
      if (cleanCls === "ج") clsVariations.push("c");
      if (cleanCls === "د") clsVariations.push("d");
      if (cleanCls === "a") clsVariations.push("ا");
      if (cleanCls === "b") clsVariations.push("ب");
      if (cleanCls === "c") clsVariations.push("ج");
      if (cleanCls === "d") clsVariations.push("د");

      let score = 0;

      for (const variant of clsVariations) {
        if (cleanSheet === variant) {
          score += 20;
          break;
        } else if (cleanSheet.includes(variant)) {
          if (variant.length === 1) {
            const regex = new RegExp(`(^|[\\s\\-_/])${variant}($|[\\s\\-_/])`);
            if (regex.test(cleanSheet)) {
              score += 10;
              break;
            }
          } else {
            score += 10;
            break;
          }
        }
      }

      if (score > highestClassScore) {
        highestClassScore = score;
        bestClass = cls;
      }
    }

    const matchedClass = highestClassScore >= 5 ? bestClass : null;
    return {
      gradeId: matchedGrade.id,
      classId: matchedClass ? matchedClass.id : null,
      gradeName: matchedGrade.name,
      className: matchedClass ? matchedClass.name : null,
      isNoisy: false
    };
  }

  // Fallback: search classes globally
  let bestClass: typeof dbClasses[0] | null = null;
  let highestClassScore = 0;
  for (const cls of dbClasses) {
    const cleanCls = sanitizeString(cls.name);
    if (cleanSheet.includes(cleanCls) && cleanCls.length > 1) {
      let score = cleanCls.length;
      if (score > highestClassScore) {
        highestClassScore = score;
        bestClass = cls;
      }
    }
  }

  if (bestClass) {
    const grade = dbGrades.find(g => g.id === bestClass.grade_id);
    return {
      gradeId: bestClass.grade_id,
      classId: bestClass.id,
      gradeName: grade?.name ?? null,
      className: bestClass.name,
      isNoisy: false
    };
  }

    return { gradeId: null, classId: null, gradeName: null, className: null, isNoisy: false };
}

function getClassLetter(className: string | null): string {
  if (!className) return "";
  const clean = sanitizeString(className);
  if (clean === "ا" || clean === "a") return "A";
  if (clean === "ب" || clean === "b") return "B";
  if (clean === "ج" || clean === "c") return "C";
  if (clean === "د" || clean === "d") return "D";
  return clean.replace(/[^a-zA-Z0-9]/g, "").toUpperCase() || "A";
}

function getGradePrefix(gradeLevel: number | null): string {
  if (gradeLevel === null) return "ST";
  if (gradeLevel === 1) return "K1";
  if (gradeLevel === 2) return "K2";
  if (gradeLevel >= 3 && gradeLevel <= 14) return `G${gradeLevel - 2}`;
  return "ST";
}

import { useAuth } from "@/hooks/use-auth";
function Imports() {
  const { isStudentAffairs, isAdmin } = useAuth();
  const [parsing, setParsing] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [importing, setImporting] = useState(false);
  const [errorDetails, setErrorDetails] = useState<{
    sheets: string[];
    bestSheet?: string;
    foundHeaders: string[];
    maxMatches: number;
  } | null>(null);

  const { data: dbGrades } = useQuery({
    queryKey: ["grades-all-import"],
    queryFn: async () => {
      const { data } = await supabase.from("grades").select("id, name, level").order("level");
      return data ?? [];
    },
  });

  const { data: dbClasses } = useQuery({
    queryKey: ["classes-all-import"],
    queryFn: async () => {
      const { data } = await supabase.from("classes").select("id, name, grade_id");
      return data ?? [];
    },
  });

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: { "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"], "application/vnd.ms-excel": [".xls"] },
    maxFiles: 1,
    onDrop: async (files) => {
      const file = files[0]; if (!file) return;
      setParsing(true); setPreview(null); setErrorDetails(null);
      try {
        const buf = await file.arrayBuffer();
        // Ensure we pass a Uint8Array to SheetJS for consistent parsing in browsers
        const array = buf instanceof ArrayBuffer ? new Uint8Array(buf) : buf;
        const wb = XLSX.read(array, { type: "array" });
        if (wb.SheetNames.length === 0) {
          toast.error("الملف لا يحتوي على أي صفحات");
          setParsing(false);
          return;
        }

        // Fetch all existing student codes and national IDs from the DB to check for uniqueness when generating
        const { data: allDbStudents } = await supabase.from("students").select("student_code, national_id");
        const existingCodes = new Set<string>();
        const nidToCodeMap = new Map<string, string>();
        (allDbStudents ?? []).forEach(s => {
          if (s.student_code) {
            existingCodes.add(String(s.student_code).trim().toUpperCase());
          }
          if (s.national_id && s.student_code) {
            nidToCodeMap.set(String(s.national_id).trim(), String(s.student_code).trim());
          }
        });
        const temporaryCodes = new Set<string>();

        // Flatten all aliases for match counting
        const allAliasSet = new Set(
          Object.values(COL_ALIASES).flat().map(a => sanitizeString(a))
        );

        const allRows: RowMap[] = [];
        const processedSheetsInfo: {
          sheetName: string;
          gradeName: string | null;
          className: string | null;
          rowCount: number;
        }[] = [];

        const gradesList = dbGrades ?? [];
        const classesList = dbClasses ?? [];

        let overallBestMaxMatches = 0;
        let overallBestSheetName: string | null = null;
        let overallFoundHeaders: string[] = [];

        for (const name of wb.SheetNames) {
          const sheet = wb.Sheets[name];
          const rawRows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 });
          if (rawRows.length === 0) continue;

          // Find the best header row in this sheet
          let maxMatches = 0;
          let headerIdx = 0;
          const scanLimit = Math.min(rawRows.length, 20);

          for (let i = 0; i < scanLimit; i++) {
            const row = rawRows[i];
            if (!Array.isArray(row)) continue;
            let matches = 0;
            for (const cell of row) {
              if (cell != null) {
                const cleaned = sanitizeString(String(cell));
                if (allAliasSet.has(cleaned)) {
                  matches++;
                }
              }
            }
            if (matches > maxMatches) {
              maxMatches = matches;
              headerIdx = i;
            }
          }

          // If no matches found in this sheet, skip it
          if (maxMatches < 1) {
            continue;
          }

          // Identify grade and class from the sheet name
          const { gradeId, classId, gradeName, className, isNoisy } = findGradeAndClass(name, gradesList, classesList);
          if (isNoisy) {
            // Skip sheets that are clearly list/mob/id exports rather than real grade/class sheets
            continue;
          }

          // Get headers
          const headers = (rawRows[headerIdx] || []) as unknown[];

          // Track best header row across all sheets for better error reporting
          if (maxMatches > overallBestMaxMatches) {
            overallBestMaxMatches = maxMatches;
            overallBestSheetName = name;
            overallFoundHeaders = headers.map(h => String(h ?? "").trim());
          }

          // Get grade level and code prefix
          const matchedGradeObj = gradesList.find(g => g.id === gradeId);
          const gradeLevel = matchedGradeObj ? matchedGradeObj.level : null;
          const codePrefix = `${getGradePrefix(gradeLevel)}${getClassLetter(className)}`;

          // Prepare a cleaned display name for this sheet (prefer right-hand side after arrow, remove counts and noise)
          let displayNameRaw = String(name ?? "");
          if (/←|→|<-|->|–|—/.test(displayNameRaw)) {
            const parts = displayNameRaw.split(/←|→|<-|->|–|—/);
            displayNameRaw = parts[parts.length - 1] || displayNameRaw;
          }
          const cleanedDisplayName = displayNameRaw
            .replace(/\(.*?\)/g, " ")
            .replace(/\b(list|mob|id)\b/gi, " ")
            .replace(/\s+/g, " ")
            .trim();

          // Skip sheets that look like exports or contact lists (contain id/mob/phone/list keywords)
          if (/\b(id|mob|mobile|phone|phone number|contact|contacts|list|قائمة|موبايل|هاتف)\b/i.test(displayNameRaw)) {
            continue;
          }
          // Also skip sheets that mention student affairs or summary words
          if (/شؤون|شؤون الطلبة|شؤون الطلاب|الجملة|جملة|جمله/i.test(displayNameRaw) || /شؤون|شؤون الطلبة|شؤون الطلاب|الجملة|جملة|جمله/i.test(cleanedDisplayName)) {
            continue;
          }

          // Parse rows
          let sheetRowCount = 0;
          for (let i = headerIdx + 1; i < rawRows.length; i++) {
            const row = rawRows[i];
            if (!Array.isArray(row) || row.every(cell => cell == null || cell === "")) continue;

            const obj: RowMap = {};
            for (let j = 0; j < headers.length; j++) {
              const headerName = String(headers[j] ?? "").trim();
              if (headerName) {
                obj[headerName] = row[j];
              }
            }

            const normalizedRow = normalize(obj);
            const cleanName = String(normalizedRow.full_name ?? "").trim();
            // Skip empty rows or header rows, but keep rows that have national_id or student_code
            const nameLower = cleanName.toLowerCase();
            const isHeaderName = nameLower === "اسم الطالب" || nameLower === "الاسم" || nameLower === "full_name" || nameLower === "name";
            const isNoisyName = /^(?:0+|اجمالي|اجمالى|مجموع|شؤون الطلبة|شؤون|شؤون الطلاب|الجملة|جملة|جمله|total|sum|subtotal)$/i.test(cleanName) || /^\d+(?:[\.,]\d+)?$/.test(cleanName);
            const hasIdentifier = (normalizedRow.national_id && String(normalizedRow.national_id).trim()) || (normalizedRow.student_code && String(normalizedRow.student_code).trim());
            // Also drop rows where either the sheet name or the student name clearly indicate 'student affairs' or summaries
            const sinSheet = sanitizeString(String(cleanedDisplayName || "")).toLowerCase();
            const sinName = sanitizeString(cleanName).toLowerCase();
            const isAffairs = /شؤون|شؤون الطلبة|شؤون الطلاب/.test(sinSheet) || /شؤون|شؤون الطلبة|شؤون الطلاب/.test(sinName);
            if (isAffairs) continue;

            if ((cleanName && !isHeaderName && !isNoisyName) || hasIdentifier) {
              normalizedRow.grade_id = gradeId;
              normalizedRow.class_id = classId;
                normalizedRow.sheet_name = cleanedDisplayName;
              normalizedRow.matched_grade_name = gradeName;
              normalizedRow.matched_class_name = className;

              // Generate student code if not provided
              let studentCode = normalizedRow.student_code ? String(normalizedRow.student_code).trim() : "";
              if (!studentCode) {
                const existingDbCode = normalizedRow.national_id ? nidToCodeMap.get(String(normalizedRow.national_id).trim()) : null;
                if (existingDbCode) {
                  normalizedRow.student_code = existingDbCode;
                } else {
                  let sequence = 1;
                  let generated = "";
                  do {
                    const seqStr = String(sequence).padStart(3, "0");
                    generated = `${codePrefix}${seqStr}`;
                    sequence++;
                  } while (existingCodes.has(generated) || temporaryCodes.has(generated));
                  temporaryCodes.add(generated);
                  normalizedRow.student_code = generated;
                }
              } else {
                normalizedRow.student_code = studentCode;
              }

              allRows.push(normalizedRow);
              sheetRowCount++;
            }
          }

          if (sheetRowCount > 0) {
            processedSheetsInfo.push({
              sheetName: cleanedDisplayName,
              gradeName,
              className,
              rowCount: sheetRowCount
            });
          }
        }

        if (allRows.length === 0) {
          setErrorDetails({
            sheets: wb.SheetNames,
            bestSheet: overallBestSheetName ?? undefined,
            foundHeaders: overallFoundHeaders,
            maxMatches: overallBestMaxMatches,
          });
          toast.error("لم يتم العثور على أعمدة معروفة في أي صفحة. تحقق من أسماء الأعمدة أو افتح Console لمزيد من التفاصيل.");
          setParsing(false);
          return;
        }

        // Dedupe rows for preview: prefer national_id, then student_code, then name+sheet
        const dedupMap = new Map<string, RowMap>();
        for (const r of allRows) {
          const nid = String(r.national_id ?? "").trim();
          const code = String(r.student_code ?? "").trim();
          const nameKey = String(r.full_name ?? "").trim().toLowerCase();
          const sheetKey = String(r.sheet_name ?? "").trim().toLowerCase();
          const key = nid || code || `${nameKey}||${sheetKey}`;
          if (!dedupMap.has(key)) dedupMap.set(key, r);
        }
        const dedupedRows = Array.from(dedupMap.values());

        const codes = dedupedRows.map(r => String(r.student_code ?? "").trim()).filter(Boolean) as string[];
        const nids = dedupedRows.map(r => String(r.national_id ?? "").trim()).filter(Boolean) as string[];
        const existing = new Set<string>();
        if (codes.length) {
          const { data } = await supabase.from("students").select("student_code").in("student_code", codes);
          (data ?? []).forEach(d => d.student_code && existing.add(`c:${d.student_code}`));
        }
        if (nids.length) {
          const { data } = await supabase.from("students").select("national_id").in("national_id", nids);
          (data ?? []).forEach(d => d.national_id && existing.add(`n:${d.national_id}`));
        }
        let toUpdate = 0, toInsert = 0;
        const keySet = new Set<string>();
        dedupedRows.forEach(r => {
          const key = r.student_code ? `c:${String(r.student_code).trim()}` : r.national_id ? `n:${String(r.national_id).trim()}` : "";
          if (key) keySet.add(key);
          if (key && existing.has(key)) toUpdate++; else toInsert++;
        });

        const rawTotal = allRows.length; // raw rows before dedupe
        const uniqueStudents = dedupedRows.length;

        setPreview({ rows: dedupedRows, toInsert, toUpdate, errors: [], sheetsInfo: processedSheetsInfo, parserVersion: IMPORT_PARSER_VERSION, rawTotal, uniqueStudents });
        toast.success(`تم تحليل ${rawTotal} صف من ${processedSheetsInfo.length} صفحة — عرض ${uniqueStudents} طلاب بعد الديدوبّينج`);
      } catch (err) {
        const msg = err && typeof err === "object" && "message" in err ? (err as any).message : String(err);
        toast.error(`فشل قراءة الملف: ${msg}`);
        console.error("Error parsing Excel file:", err);
      }
      setParsing(false);
    },
  });

  if (!(isStudentAffairs || isAdmin)) return <div className="text-center text-muted-foreground py-12">هذه الصفحة متاحة لشؤون الطلاب فقط</div>;

  async function confirmImport() {
    if (!preview) return;
    setImporting(true);
    let inserted = 0, updated = 0, skipped = 0;
    for (const r of preview.rows) {
      const payload = {
        full_name: String(r.full_name ?? "").trim() || "بدون اسم",
        student_code: r.student_code ? String(r.student_code) : null,
        national_id: r.national_id ? String(r.national_id) : null,
        birth_date: parseBirthDate(r.birth_date),
        birth_place: r.birth_place ? String(r.birth_place) : null,
        gender: r.gender ? String(r.gender) : null,
        religion: r.religion ? String(r.religion) : null,
        mother_name: r.mother_name ? String(r.mother_name) : null,
        mother_national_id: r.mother_national_id ? String(r.mother_national_id) : null,
        father_national_id: r.father_national_id ? String(r.father_national_id) : null,
        guardian_name: r.guardian_name ? String(r.guardian_name) : null,
        guardian_job: r.guardian_job ? String(r.guardian_job) : null,
        address: r.address ? String(r.address) : null,
        phone: r.phone ? String(r.phone) : null,
        first_installment: Number(r.first_installment ?? 0) || 0,
        second_installment: Number(r.second_installment ?? 0) || 0,
        previous_installments: Number(r.previous_installments ?? 0) || 0,
        other_fees: Number(r.other_fees ?? 0) || 0,
        grade_id: r.grade_id ? String(r.grade_id) : null,
        class_id: r.class_id ? String(r.class_id) : null,
      };
      let existing: { id: string; student_code: string | null } | null = null;
      if (payload.student_code) {
        const { data } = await supabase.from("students").select("id, student_code").eq("student_code", payload.student_code).maybeSingle();
        existing = data;
      }
      if (!existing && payload.national_id) {
        const { data } = await supabase.from("students").select("id, student_code").eq("national_id", payload.national_id).maybeSingle();
        existing = data;
      }
      if (existing) {
        if (existing.student_code) {
          payload.student_code = existing.student_code;
        }
        const { error } = await supabase.from("students").update(payload).eq("id", existing.id);
        if (error) skipped++; else updated++;
      } else {
        const { error } = await supabase.from("students").insert(payload);
        if (error) skipped++; else inserted++;
      }
    }
    await supabase.from("student_imports").insert({
      rows_total: preview.rows.length, rows_inserted: inserted, rows_updated: updated, rows_skipped: skipped,
      parser_version: IMPORT_PARSER_VERSION,
    });
    const { logActivity } = await import("@/lib/audit");
    await logActivity("import", "import", null, { inserted, updated, skipped, total: preview.rows.length });
    setImporting(false); setPreview(null);
    toast.success(`تم: ${inserted} إضافة · ${updated} تحديث · ${skipped} تخطي`);
  }

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold">استيراد ملفات Excel</h1>
        <p className="text-muted-foreground mt-1">رفع ملفات الأقساط (XLSX/XLS) — مطابقة تلقائية بالكود أو الرقم القومي</p>
      </div>

      <Card>
        <CardContent className="p-6">
          <div {...getRootProps()} className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${isDragActive ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"}`}>
            <input {...getInputProps()} />
            {parsing ? <Loader2 className="h-10 w-10 mx-auto animate-spin text-primary" /> : <Upload className="h-10 w-10 mx-auto text-muted-foreground" />}
            <p className="mt-3 font-medium">اسحب الملف هنا أو اضغط للاختيار</p>
            <p className="text-sm text-muted-foreground mt-1">XLSX، XLS</p>
          </div>
        </CardContent>
      </Card>

      {errorDetails && (
        <Card className="border-destructive bg-destructive/5">
          <CardHeader>
            <CardTitle className="text-destructive text-lg font-bold flex items-center gap-2">
              ⚠️ تفاصيل الخطأ في مطابقة الأعمدة
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm" dir="rtl">
            <p className="text-muted-foreground">
              لم نستطع العثور على أعمدة أساسية (مثل: اسم الطالب أو الرقم القومي) في الملف المرفوع. إليك التفاصيل الفنية لمساعدتك في تعديل الملف:
            </p>
            <div className="space-y-2 bg-background p-4 rounded-lg border text-right">
              <div>
                <strong>الصفحات المتوفرة في الملف:</strong>{" "}
                <span className="font-mono">{errorDetails.sheets.join(" · ")}</span>
              </div>
              {errorDetails.bestSheet && (
                <div>
                  <strong>الصفحة التي تم تحليلها:</strong>{" "}
                  <span className="font-mono text-primary font-bold">{errorDetails.bestSheet}</span>
                </div>
              )}
              <div>
                <strong>أكبر عدد أعمدة متطابقة في سطر واحد:</strong>{" "}
                <span className="font-mono font-bold text-destructive">{errorDetails.maxMatches} عمود</span>
              </div>
              <div>
                <strong>عناوين الأعمدة المقروءة في السطر المحدد:</strong>
                <div className="mt-1 flex flex-wrap gap-1.5 max-h-32 overflow-y-auto p-2 bg-muted rounded font-mono text-xs">
                  {errorDetails.foundHeaders.length > 0 ? (
                    errorDetails.foundHeaders.map((h, i) => (
                      <Badge key={i} variant="outline" className="bg-background">
                        {h || "—"}
                      </Badge>
                    ))
                  ) : (
                    <span className="text-muted-foreground">لا توجد عناوين أعمدة مقروءة</span>
                  )}
                </div>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              💡 نصيحة: تأكد من أن الملف يحتوي على عمود باسم <strong>"اسم الطالب"</strong> أو <strong>"الرقم القومي للطالب"</strong> أو <strong>"الاسم"</strong> في رأس الجدول بشكل واضح.
            </p>
          </CardContent>
        </Card>
      )}

      {preview && (
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><FileSpreadsheet className="h-5 w-5" />معاينة الاستيراد</CardTitle></CardHeader>
          <CardContent>
            <div className="flex gap-3 mb-4 flex-wrap">
              <Badge className="bg-success text-success-foreground">جديد: {preview.toInsert}</Badge>
              <Badge className="bg-warning text-warning-foreground">تحديث: {preview.toUpdate}</Badge>
              <Badge variant="outline">إجمالي صفوف: {preview.rawTotal ?? preview.rows.length}</Badge>
              <Badge variant="secondary">طلاب مميزين: {preview.uniqueStudents ?? "—"}</Badge>
            </div>
            {preview.parserVersion && (
              <div className="text-xs text-muted-foreground mb-3">إصدار محلل الاستيراد: <strong>{preview.parserVersion}</strong></div>
            )}
            
            {preview.sheetsInfo && preview.sheetsInfo.length > 0 && (
              <div className="mb-4 bg-muted/40 p-3 rounded-lg border text-right" dir="rtl">
                <h3 className="font-semibold text-sm mb-2 text-right">الفصول والصفوف التي تم التعرف عليها:</h3>
                <div className="flex flex-wrap gap-2 justify-start">
                  {preview.sheetsInfo.map((info, idx) => (
                    <Badge key={idx} variant="secondary" className="text-[11px] py-1 px-2.5 bg-background border hover:bg-muted">
                      📁 {info.sheetName} ← {info.gradeName ? `${info.gradeName}${info.className ? ` (${info.className})` : ""}` : "لم يتم المطابقة"} ({info.rowCount} طالب)
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            <div className="border rounded-md overflow-x-auto max-h-64">
              <table className="w-full text-xs">
                <thead className="bg-muted sticky top-0"><tr>
                  <th className="px-2 py-2 text-right">الاسم</th>
                  <th className="px-2 py-2 text-right">الكود</th>
                  <th className="px-2 py-2 text-right">الصف / الفصل</th>
                  <th className="px-2 py-2 text-right">قسط 1</th>
                  <th className="px-2 py-2 text-right">قسط 2</th>
                  <th className="px-2 py-2 text-right">سابقة</th>
                  <th className="px-2 py-2 text-right">أخرى</th>
                </tr></thead>
                <tbody>
                  {preview.rows.slice(0, 50).map((r, i) => (
                    <tr key={i} className="border-t">
                      <td className="px-2 py-1.5">{String(r.full_name ?? "—")}</td>
                      <td className="px-2 py-1.5">{String(r.student_code ?? "—")}</td>
                      <td className="px-2 py-1.5 text-right">
                        <span className="text-muted-foreground text-[10px] block">
                          {String(r.sheet_name ?? "")}
                        </span>
                        {r.matched_grade_name ? (
                          <span className="font-semibold text-primary">
                            {String(r.matched_grade_name)}
                            {r.matched_class_name ? ` - ${String(r.matched_class_name)}` : ""}
                          </span>
                        ) : (
                          <span className="text-destructive font-medium text-[11px]">لم يتم مطابقة الصف</span>
                        )}
                      </td>
                      <td className="px-2 py-1.5">{String(r.first_installment ?? 0)}</td>
                      <td className="px-2 py-1.5">{String(r.second_installment ?? 0)}</td>
                      <td className="px-2 py-1.5">{String(r.previous_installments ?? 0)}</td>
                      <td className="px-2 py-1.5">{String(r.other_fees ?? 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex gap-3 mt-4">
              <Button onClick={confirmImport} disabled={importing}>
                {importing && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}تأكيد الاستيراد
              </Button>
              <Button variant="outline" onClick={() => setPreview(null)} disabled={importing}>إلغاء</Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
