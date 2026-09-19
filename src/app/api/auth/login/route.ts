/**
 * Sign in. Patients and practitioners use the same endpoint and are told apart
 * by which table their email is in, so nobody has to know which button to press.
 */

import { NextResponse } from "next/server";
import { handle, badRequest } from "@/lib/api";
import { findPatientByEmail, findPractitionerByEmail } from "@/lib/db/queries";
import { startSession, verifyPassword } from "@/lib/auth/session";

export async function POST(request: Request) {
  return handle(async () => {
    const { email, password } = (await request.json()) as { email?: string; password?: string };
    if (!email || !password) badRequest("Enter your email and your password.");

    const practitioner = await findPractitionerByEmail(email);
    if (practitioner && (await verifyPassword(password, practitioner.password_hash))) {
      await startSession({
        id: practitioner.id,
        role: "practitioner",
        name: practitioner.full_name,
      });
      return { role: "practitioner", redirect: "/practitioner" };
    }

    const patient = await findPatientByEmail(email);
    if (patient && (await verifyPassword(password, patient.password_hash))) {
      await startSession({ id: patient.id, role: "patient", name: patient.first_name });
      return { role: "patient", redirect: "/" };
    }

    // One message for a wrong email and a wrong password, so the response
    // cannot be used to find out which addresses have accounts.
    badRequest("That email and password do not match an account.");
  });
}

export async function GET() {
  return NextResponse.json({ error: "Use POST to sign in." }, { status: 405 });
}
