import { permanentRedirect } from "next/navigation";

/** The sign-in form moved to /sign-in. Old links and bookmarks still land on it. */
export default function LoginPage() {
  permanentRedirect("/sign-in");
}
