import { createClient } from '@supabase/supabase-js';

const supabaseUrl = "https://rvbtjytipbjmnikrsfbw.supabase.co";
const supabaseKey = "sb_publishable_1rHjswvH23OUi0Gqui6t1A_XEfbsOyM";

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const email = `test_admin_${Date.now()}@school.local`;
  const password = "SaintGeorge2026_StrongAdmin!";

  console.log("Registering user:", email);
  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: "Test Admin",
        username: "testadmin" + Date.now(),
        department: "admin",
      }
    }
  });

  if (signUpError) {
    console.error("SignUp Error:", signUpError);
    return;
  }

  const user = signUpData.user;
  if (!user) {
    console.error("No user returned");
    return;
  }
  console.log("User registered with ID:", user.id);

  // Now, sign in to get the session
  const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (signInError) {
    console.error("SignIn Error:", signInError);
    return;
  }

  console.log("Signed in. Updating own profile status to 'approved' and department to 'admin'...");
  
  // Try to update the profile to approved
  const { data: profileUpdate, error: profileError } = await supabase
    .from("profiles")
    .update({
      status: "approved",
      department: "admin",
    })
    .eq("id", user.id)
    .select();

  if (profileError) {
    console.error("Profile update error:", profileError);
    return;
  }

  console.log("Profile updated successfully:", profileUpdate);

  // Let's verify roles
  const { data: roles, error: rolesError } = await supabase
    .from("user_roles")
    .select("*");

  if (rolesError) {
    console.error("Roles fetch error:", rolesError);
  } else {
    console.log("My roles:", roles);
  }

  // Now query receipts
  const { data: receipts, error: receiptsError } = await supabase
    .from("receipts")
    .select("*, students(full_name)")
    .order("created_at", { ascending: false })
    .limit(10);

  if (receiptsError) {
    console.error("Receipts fetch error:", receiptsError);
  } else {
    console.log("Recent receipts:", JSON.stringify(receipts, null, 2));
  }
}

run();
