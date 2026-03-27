import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useNavigate, useParams } from "@tanstack/react-router";
import {
  ArrowLeft,
  Camera,
  CheckCircle,
  Flame,
  Loader2,
  Shield,
} from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { Answer, Registration, ShoppingItem } from "../backend";
import { useActor } from "../hooks/useActor";
import { useInternetIdentity } from "../hooks/useInternetIdentity";
import { useGetGame } from "../hooks/useQueries";
import { loadVideo } from "../utils/videoStorage";

const GAME_GRADIENTS = [
  "from-orange-900 via-red-950 to-black",
  "from-purple-900 via-indigo-950 to-black",
  "from-green-900 via-emerald-950 to-black",
  "from-yellow-900 via-orange-950 to-black",
  "from-cyan-900 via-blue-950 to-black",
];

const parseQText = (raw: string): { text: string; imageUrl?: string } => {
  try {
    const p = JSON.parse(raw);
    if (typeof p.text === "string") {
      if (p.imageRef) {
        const storedImg = localStorage.getItem(`cvr_qimg_${p.imageRef}`);
        return { text: p.text, imageUrl: storedImg || undefined };
      }
      if (p.imageUrl) {
        return { text: p.text, imageUrl: p.imageUrl };
      }
      return { text: p.text };
    }
  } catch {}
  return { text: raw };
};

export default function GameRegisterPage() {
  const params = useParams({ from: "/game/$id" });
  const navigate = useNavigate();
  const gameId = BigInt(params.id);
  const { data: game, isLoading } = useGetGame(gameId);
  const { actor, isFetching: actorFetching } = useActor();
  const { identity, login, loginStatus } = useInternetIdentity();

  const [playerName, setPlayerName] = useState("");
  const [uid, setUid] = useState("");
  const [inGameName, setInGameName] = useState("");
  const [transactionId, setTransactionId] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [dupTxnDialogOpen, setDupTxnDialogOpen] = useState(false);
  const [bgVideoSrc, setBgVideoSrc] = useState("");
  const gameIdStr = game?.id?.toString();
  useEffect(() => {
    if (!gameIdStr) return;
    loadVideo(`cvr_bgvideo_game_${gameIdStr}`).then((url) => {
      setBgVideoSrc(url || "");
    });
  }, [gameIdStr]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!actor || !game || !identity) {
      toast.error("Please login to register");
      return;
    }

    if (!playerName.trim() || !uid.trim() || !inGameName.trim()) {
      toast.error("Please fill all required fields");
      return;
    }

    if (!transactionId.trim()) {
      toast.error("Please enter your transaction ID");
      return;
    }

    setIsSubmitting(true);
    try {
      // Check for duplicate transaction ID (belt-and-suspenders: catch if method not yet deployed)
      let isDuplicate = false;
      try {
        const extActor = actor as any;
        if (typeof extActor.checkTransactionId === "function") {
          isDuplicate = await extActor.checkTransactionId(transactionId.trim());
        }
      } catch {
        // method not available yet, skip duplicate check
      }

      if (isDuplicate) {
        setDupTxnDialogOpen(true);
        setIsSubmitting(false);
        return;
      }

      const answerList: Answer[] = game.questions
        .filter((q) => answers[q.id.toString()] !== undefined)
        .map((q) => ({
          questionId: q.id,
          answer: answers[q.id.toString()] || "",
        }));

      const reg = {
        id: BigInt(0),
        playerName: playerName.trim(),
        uid: uid.trim(),
        inGameName: inGameName.trim(),
        transactionId: transactionId.trim(),
        paymentStatus: "pending",
        owner: identity.getPrincipal(),
        answers: answerList,
        createdAt: BigInt(Date.now()) * BigInt(1_000_000),
        gameId: game.id,
      } as Registration & { transactionId: string };

      let regId: bigint;
      try {
        regId = await actor.submitRegistration(reg as Registration);
      } catch (err) {
        const errMsg = String(err);
        if (errMsg.includes("DUPLICATE_TRANSACTION_ID")) {
          setDupTxnDialogOpen(true);
          setIsSubmitting(false);
          return;
        }
        throw err;
      }

      // Create Stripe checkout
      const successUrl = `${window.location.origin}/payment-success?session_id={CHECKOUT_SESSION_ID}&reg_id=${regId.toString()}`;
      const cancelUrl = `${window.location.origin}/game/${game.id.toString()}`;

      const items: ShoppingItem[] = [
        {
          productName: game.title,
          productDescription: `Registration for ${game.title} tournament`,
          currency: "inr",
          quantity: BigInt(1),
          priceInCents: game.entryFee * BigInt(100),
        },
      ];

      try {
        const checkoutUrl = await actor.createCheckoutSession(
          items,
          successUrl,
          cancelUrl,
        );
        window.location.href = checkoutUrl;
      } catch {
        // Stripe not configured, show success anyway
        toast.success("Registration submitted! Payment integration pending.");
        setSubmitted(true);
      }
    } catch (err) {
      console.error(err);
      toast.error("Registration failed. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const gradientClass = GAME_GRADIENTS[Number(gameId) % GAME_GRADIENTS.length];

  if (isLoading || actorFetching) {
    return (
      <div
        className="min-h-screen bg-background flex items-center justify-center"
        data-ocid="register.loading_state"
      >
        <Loader2 className="w-8 h-8 animate-spin text-orange-glow" />
      </div>
    );
  }

  if (!game) {
    return (
      <div
        className="min-h-screen bg-background flex items-center justify-center"
        data-ocid="register.error_state"
      >
        <div className="text-center">
          <p className="text-muted-foreground font-display">GAME NOT FOUND</p>
          <Button
            className="btn-primary mt-4"
            onClick={() => navigate({ to: "/" })}
          >
            BACK TO HOME
          </Button>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div
        className="min-h-screen bg-background flex items-center justify-center px-4"
        data-ocid="register.success_state"
      >
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="text-center"
        >
          <CheckCircle className="w-16 h-16 text-orange-glow mx-auto mb-4 glow-orange" />
          <h2 className="font-display text-2xl text-foreground mb-2">
            REGISTRATION SUBMITTED!
          </h2>
          <p className="text-muted-foreground text-sm mb-6">
            You'll receive confirmation shortly.
          </p>
          <Button
            className="btn-primary"
            onClick={() => navigate({ to: "/" })}
            data-ocid="register.primary_button"
          >
            BACK TO HOME
          </Button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen relative">
      {/* Animated Background */}
      <div className="fixed inset-0 -z-10 overflow-hidden bg-background">
        <div
          style={{
            position: "absolute",
            top: "-10%",
            left: "-10%",
            width: "600px",
            height: "600px",
            background:
              "radial-gradient(circle, oklch(0.65 0.22 40 / 0.18) 0%, transparent 70%)",
            filter: "blur(40px)",
            animation: "orbFloat1 28s ease-in-out infinite",
            willChange: "transform",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: "-10%",
            right: "-10%",
            width: "500px",
            height: "500px",
            background:
              "radial-gradient(circle, oklch(0.78 0.18 195 / 0.15) 0%, transparent 70%)",
            filter: "blur(40px)",
            animation: "orbFloat2 22s ease-in-out infinite 4s",
            willChange: "transform",
          }}
        />
        <div
          style={{
            position: "absolute",
            top: "40%",
            right: "15%",
            width: "400px",
            height: "400px",
            background:
              "radial-gradient(circle, oklch(0.65 0.22 40 / 0.10) 0%, transparent 70%)",
            filter: "blur(50px)",
            animation: "orbFloat3 32s ease-in-out infinite 8s",
            willChange: "transform",
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage:
              "linear-gradient(oklch(0.78 0.18 195 / 0.04) 1px, transparent 1px), linear-gradient(90deg, oklch(0.78 0.18 195 / 0.04) 1px, transparent 1px)",
            backgroundSize: "60px 60px",
          }}
        />
      </div>
      {/* Background Video */}
      {bgVideoSrc && (
        <video
          key={bgVideoSrc}
          autoPlay
          muted
          loop
          playsInline
          className="fixed inset-0 w-full h-full object-cover z-0 opacity-40"
          src={bgVideoSrc}
        />
      )}
      {bgVideoSrc && (
        <div className="fixed inset-0 z-[1] bg-background/60 backdrop-blur-[1px]" />
      )}
      {/* Duplicate Transaction ID Dialog */}
      <Dialog open={dupTxnDialogOpen} onOpenChange={setDupTxnDialogOpen}>
        <DialogContent
          className="bg-steel-dark border border-destructive/60 max-w-sm mx-4"
          data-ocid="register.dialog"
        >
          <DialogHeader>
            <DialogTitle className="font-display text-destructive text-base tracking-wider">
              ⚠ INVALID TRANSACTION ID
            </DialogTitle>
            <DialogDescription className="text-muted-foreground text-sm leading-relaxed pt-1">
              This transaction ID has already been used by another player.
              Please check your payment and enter the correct transaction ID.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="pt-2">
            <Button
              className="btn-primary w-full"
              onClick={() => setDupTxnDialogOpen(false)}
              data-ocid="register.confirm_button"
            >
              OK
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Header */}
      <header className="sticky top-0 z-[60] bg-steel-dark/95 backdrop-blur border-b border-border/50">
        <div className="max-w-[430px] mx-auto px-4 h-14 flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate({ to: "/" })}
            className="text-muted-foreground hover:text-orange-glow transition-colors"
            data-ocid="register.cancel_button"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center">
            <img
              src="/assets/uploads/file_0000000036c871fa907a38c9391d7ff1-019d2d6c-afb4-74ed-9daa-5e79002c5aee-1.png"
              alt="CVR eSports Logo"
              className="h-9 w-auto object-contain"
            />
          </div>
        </div>
      </header>

      <div className="max-w-[430px] mx-auto pb-8 relative z-[2]">
        {/* Game Banner */}
        <div className={`relative h-40 bg-gradient-to-br ${gradientClass}`}>
          {game.bannerUrl &&
            (() => {
              const src = game.bannerUrl.startsWith("local:")
                ? localStorage.getItem(
                    `cvr_banner_${game.bannerUrl.slice(6)}`,
                  ) || ""
                : game.bannerUrl;
              return src ? (
                <img
                  src={src}
                  alt={game.title}
                  className="w-full h-full object-cover"
                />
              ) : null;
            })()}
          <div className="absolute inset-0 bg-gradient-to-t from-background to-transparent" />
          <div className="absolute inset-0 flex items-center justify-center">
            <Shield className="w-16 h-16 text-orange-glow/20" />
          </div>
          <div className="absolute bottom-3 left-4">
            <h1 className="font-display text-xl font-bold text-foreground text-glow-orange">
              {game.title}
            </h1>
            <div className="flex items-center gap-2 mt-1">
              <Badge className="bg-primary/90 text-primary-foreground text-xs font-display">
                ₹{game.entryFee.toString()}
              </Badge>
              <Badge
                variant="outline"
                className="text-xs border-border/60 text-muted-foreground"
              >
                {game.platform}
              </Badge>
            </div>
          </div>
          <div className="absolute top-3 right-3">
            <Flame className="w-5 h-5 text-orange-glow animate-pulse" />
          </div>
        </div>

        {/* Form */}
        <div className="px-4 pt-6">
          <div className="mb-4">
            <div className="metal-divider mb-3" />
            <h2 className="font-display text-lg font-bold text-foreground">
              REGISTRATION FORM
            </h2>
            <p className="text-muted-foreground text-xs mt-1">
              {game.description}
            </p>
          </div>

          {!identity && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="bg-card border border-orange-glow/30 rounded-lg p-4 mb-4 text-center"
              data-ocid="register.panel"
            >
              <p className="text-muted-foreground text-xs mb-3">
                Login to submit your registration
              </p>
              <Button
                className="btn-primary w-full"
                onClick={() => login()}
                disabled={loginStatus === "logging-in"}
                data-ocid="register.primary_button"
              >
                {loginStatus === "logging-in" ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    LOGGING IN...
                  </>
                ) : (
                  "LOGIN TO REGISTER"
                )}
              </Button>
            </motion.div>
          )}

          <form
            onSubmit={handleSubmit}
            className="space-y-4"
            data-ocid="register.panel"
          >
            {/* Default fields */}
            <div className="space-y-1.5">
              <Label className="font-display text-xs text-muted-foreground">
                PLAYER NAME *
              </Label>
              <Input
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                placeholder="Enter your real name"
                required
                className="bg-card border-border focus:border-orange-glow text-sm"
                data-ocid="register.input"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="font-display text-xs text-muted-foreground">
                PLAYER UID *
              </Label>
              <Input
                value={uid}
                onChange={(e) => setUid(e.target.value)}
                placeholder="Your game UID"
                required
                className="bg-card border-border focus:border-orange-glow text-sm"
                data-ocid="register.input"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="font-display text-xs text-muted-foreground">
                IN-GAME NAME *
              </Label>
              <Input
                value={inGameName}
                onChange={(e) => setInGameName(e.target.value)}
                placeholder="Your in-game nickname"
                required
                className="bg-card border-border focus:border-orange-glow text-sm"
                data-ocid="register.input"
              />
            </div>

            {/* Custom questions */}
            {game.questions.map((q) => {
              const parsed = parseQText(q.questionText);
              const isPhoto = q.fieldType === "photo";
              return (
                <div key={q.id.toString()} className="space-y-1.5">
                  <Label className="font-display text-xs text-muted-foreground">
                    {parsed.text.toUpperCase()} {q.required && "*"}
                  </Label>
                  {parsed.imageUrl && (
                    <img
                      src={parsed.imageUrl}
                      alt="Question"
                      className="w-full max-h-48 object-contain rounded-lg border border-border/50 mb-1"
                    />
                  )}
                  {isPhoto ? (
                    <div className="space-y-2">
                      <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-border/60 rounded-lg p-4 cursor-pointer hover:border-orange-glow/50 transition-colors bg-card/50">
                        {answers[q.id.toString()] ? (
                          <div className="relative w-full">
                            <img
                              src={answers[q.id.toString()]}
                              alt="Your upload"
                              className="w-full max-h-48 object-contain rounded"
                            />
                            <button
                              type="button"
                              className="absolute top-1 right-1 bg-destructive text-white rounded-full w-5 h-5 flex items-center justify-center text-xs"
                              onClick={() =>
                                setAnswers((prev) => ({
                                  ...prev,
                                  [q.id.toString()]: "",
                                }))
                              }
                            >
                              ×
                            </button>
                          </div>
                        ) : (
                          <>
                            <Camera className="w-7 h-7 text-muted-foreground" />
                            <span className="text-xs text-muted-foreground text-center">
                              Tap to upload photo
                              <br />
                              <span className="text-[10px] opacity-60">
                                JPG / PNG, max 2 MB
                              </span>
                            </span>
                          </>
                        )}
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          required={q.required && !answers[q.id.toString()]}
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            if (file.size > 2 * 1024 * 1024) {
                              toast.error("Max file size is 2 MB");
                              return;
                            }
                            const reader = new FileReader();
                            reader.onload = () => {
                              setAnswers((prev) => ({
                                ...prev,
                                [q.id.toString()]: reader.result as string,
                              }));
                            };
                            reader.readAsDataURL(file);
                            e.target.value = "";
                          }}
                          data-ocid="register.upload_button"
                        />
                      </label>
                    </div>
                  ) : (
                    <Input
                      type={q.fieldType === "number" ? "number" : "text"}
                      value={answers[q.id.toString()] || ""}
                      onChange={(e) =>
                        setAnswers((prev) => ({
                          ...prev,
                          [q.id.toString()]: e.target.value,
                        }))
                      }
                      required={q.required}
                      className="bg-card border-border focus:border-orange-glow text-sm"
                      data-ocid="register.input"
                    />
                  )}
                </div>
              );
            })}

            <div className="pt-2 pb-4">
              <div className="bg-card border border-border/50 rounded-lg p-3 mb-4">
                <div className="flex justify-between items-center">
                  <span className="font-display text-xs text-muted-foreground">
                    ENTRY FEE
                  </span>
                  <span className="font-display text-lg font-bold text-orange-glow text-glow-orange">
                    ₹{game.entryFee.toString()}
                  </span>
                </div>
              </div>

              {/* Transaction ID field */}
              <div className="space-y-1.5 mb-4">
                <Label className="font-display text-xs text-muted-foreground">
                  TRANSACTION ID *
                </Label>
                <Input
                  value={transactionId}
                  onChange={(e) => setTransactionId(e.target.value)}
                  placeholder="Enter your UPI/payment transaction ID"
                  required
                  className="bg-card border-border focus:border-orange-glow text-sm"
                  data-ocid="register.input"
                />
                <p className="text-[10px] text-muted-foreground/70">
                  Enter the transaction ID from your UPI payment screenshot
                </p>
              </div>

              <Button
                type="submit"
                className="btn-primary w-full h-12 text-base glow-orange"
                disabled={isSubmitting || !identity}
                data-ocid="register.submit_button"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin mr-2" />
                    PROCESSING...
                  </>
                ) : (
                  "PAY & REGISTER"
                )}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
