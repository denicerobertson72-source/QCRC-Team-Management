import { LoginForm } from "@/components/LoginForm";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  return (
    <main className="stack" style={{ paddingTop: "3rem", maxWidth: 500 }}>
      <LoginForm initialError={params.error ?? null} />
    </main>
  );
}
