import { Metadata } from "next";
import { VerificationPanel } from "@/components/verify/verification-panel";
import Link from "next/link";

interface VerifyPageProps {
  params: Promise<{ gameId: string }>;
}

export const metadata: Metadata = {
  title: "Verify Game Fairness",
  description: "Verify that a GridBlitz game was provably fair using cryptographic proof.",
};

export default async function VerifyPage({ params }: VerifyPageProps) {
  const { gameId } = await params;

  // In production, fetch from DB. For now, show the verification UI structure.
  // const game = await getGameById(gameId);

  return (
    <div className="min-h-dvh bg-midnight">
      <div className="max-w-2xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <Link
            href="/"
            className="text-sm text-text-muted hover:text-text-primary transition-colors"
          >
            &larr; Back to GridBlitz
          </Link>
          <h1 className="text-2xl font-bold text-text-primary mt-4">
            Game Verification
          </h1>
          <p className="text-text-secondary text-sm mt-1">
            Game ID: <span className="font-mono text-xs">{gameId}</span>
          </p>
        </div>

        {/* Verification panel */}
        <VerificationPanel
          serverSeed={null}
          serverSeedHash="Fetching..."
          clientSeed="Fetching..."
          nonce={0}
          totalPlays={0}
          gameStatus="loading"
        />
      </div>
    </div>
  );
}
