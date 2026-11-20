import type { Metadata } from "next";
import { AuthForm } from "@/components/college/auth";
export const metadata: Metadata = { title: "Staff sign in", robots: {index:false, follow:false} };
export default function Page() { return <AuthForm staffOnly/>; }
