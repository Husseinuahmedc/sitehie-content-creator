import { redirect } from "next/navigation";

/**
 * Root route is the front door: land on /home (the Arabic episode grid),
 * not the editor. The editor lives at /editor and is reached from /home's
 * "open episode" / "new episode" actions.
 */
export default function RootPage() {
  redirect("/home");
}