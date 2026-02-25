"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

interface VerificationPanelProps {
  serverSeed: string | null;
  serverSeedHash: string;
  clientSeed: string;
  nonce: number;
  totalPlays: number;
  gameStatus: string;
}

export function VerificationPanel({
  serverSeed,
  serverSeedHash,
  clientSeed,
  nonce,
  totalPlays,
  gameStatus,
}: VerificationPanelProps) {
  const [verificationResult, setVerificationResult] = useState<
    "idle" | "verifying" | "match" | "mismatch"
  >("idle");

  const handleVerify = async () => {
    if (!serverSeed) return;
    setVerificationResult("verifying");

    try {
      // Use Web Crypto API for browser-side verification
      const encoder = new TextEncoder();
      const data = encoder.encode(serverSeed);
      const hashBuffer = await crypto.subtle.digest("SHA-256", data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const computedHash = hashArray
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

      if (computedHash === serverSeedHash) {
        setVerificationResult("match");
      } else {
        setVerificationResult("mismatch");
      }
    } catch {
      setVerificationResult("mismatch");
    }
  };

  return (
    <div className="space-y-6">
      {/* Explainer */}
      <Card variant="glass" padding="lg">
        <h2 className="text-lg font-semibold text-text-primary mb-3">
          How Provably Fair Works
        </h2>
        <div className="space-y-2 text-sm text-text-secondary">
          <p>
            Every game in GridBlitz is provably fair. Before a game begins,
            we commit to a{" "}
            <span className="text-text-primary font-medium">server seed</span>{" "}
            by publishing its{" "}
            <span className="text-text-primary font-medium">SHA-256 hash</span>.
            This hash is visible to everyone before the game starts.
          </p>
          <p>
            The game&apos;s random outcomes are determined by combining the server
            seed with a client seed using HMAC-SHA256. After the game, we reveal
            the actual server seed so anyone can verify:
          </p>
          <ol className="list-decimal list-inside space-y-1 ml-2">
            <li>The hash matches (seed wasn&apos;t changed after the game)</li>
            <li>The same seeds reproduce the exact same game (deterministic)</li>
          </ol>
        </div>
      </Card>

      {/* Seed data */}
      <div className="space-y-4">
        <SeedField
          label="Server Seed Hash (published before game)"
          value={serverSeedHash}
          alwaysVisible
        />

        <SeedField
          label="Server Seed (revealed after game)"
          value={
            serverSeed
              ? serverSeed
              : gameStatus === "completed"
                ? "Loading..."
                : "Hidden until game completes"
          }
          hidden={!serverSeed && gameStatus !== "completed"}
        />

        <SeedField label="Client Seed" value={clientSeed} alwaysVisible />

        <div className="grid grid-cols-2 gap-4">
          <SeedField
            label="Starting Nonce"
            value={nonce.toString()}
            alwaysVisible
          />
          <SeedField
            label="Total Plays"
            value={totalPlays.toString()}
            alwaysVisible
          />
        </div>
      </div>

      {/* Verify button */}
      {serverSeed && (
        <div className="space-y-4">
          <Button
            variant="gold"
            size="lg"
            onClick={handleVerify}
            loading={verificationResult === "verifying"}
            className="w-full"
          >
            {verificationResult === "idle" && "Verify Game Fairness"}
            {verificationResult === "verifying" && "Verifying..."}
            {verificationResult === "match" && "Verified — Hash Matches!"}
            {verificationResult === "mismatch" && "Verification Failed"}
          </Button>

          {verificationResult === "match" && (
            <div className="rounded-xl bg-success/10 border border-success/30 p-4 text-center">
              <div className="text-success font-semibold text-lg">
                Verified
              </div>
              <p className="text-sm text-text-secondary mt-1">
                SHA-256(serverSeed) matches the pre-game hash. This game was
                provably fair.
              </p>
            </div>
          )}

          {verificationResult === "mismatch" && (
            <div className="rounded-xl bg-danger/10 border border-danger/30 p-4 text-center">
              <div className="text-danger font-semibold text-lg">
                Mismatch
              </div>
              <p className="text-sm text-text-secondary mt-1">
                The hash does not match. Please report this issue.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SeedField({
  label,
  value,
  alwaysVisible,
  hidden,
}: {
  label: string;
  value: string;
  alwaysVisible?: boolean;
  hidden?: boolean;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-text-muted uppercase tracking-wider mb-1.5">
        {label}
      </label>
      <div
        className={`
          px-3 py-2.5 rounded-lg bg-surface border border-border font-mono text-xs
          break-all select-all
          ${hidden ? "text-text-muted italic" : "text-text-primary"}
          ${alwaysVisible ? "" : ""}
        `}
      >
        {value}
      </div>
    </div>
  );
}
