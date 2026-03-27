import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { HttpAgent } from "@icp-sdk/core/agent";
import { useNavigate } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  Download,
  Edit,
  ImagePlus,
  KeyRound,
  Layers,
  Loader2,
  Lock,
  Plus,
  Save,
  Shield,
  Trash2,
  Trophy,
  Users,
  Video,
  X,
  Zap,
} from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { GameTile, Question } from "../backend";
import { createActorWithConfig, loadConfig } from "../config";
import { useActor } from "../hooks/useActor";
import { useInternetIdentity } from "../hooks/useInternetIdentity";
import {
  useCreateGame,
  useDeleteGame,
  useGetGameRegistrations,
  useIsAdmin,
  useIsStripeConfigured,
  useListAllGames,
  useListOpenGames,
  useSetStripeConfiguration,
  useUpdateGame,
  useUpdatePaymentStatus,
} from "../hooks/useQueries";
import { StorageClient } from "../utils/StorageClient";
import {
  deleteVideo,
  hasVideo,
  loadVideo,
  saveVideo,
} from "../utils/videoStorage";

const getAdminPassword = () =>
  localStorage.getItem("cvr_admin_password") || "000";

const EMPTY_GAME: Omit<GameTile, "id"> = {
  title: "",
  description: "",
  isOpen: true,
  platform: "-",
  questions: [],
  bannerUrl: "",
  entryFee: BigInt(0),
};

// ── ChangePasswordDialog ────────────────────────────────────────────────────
function ChangePasswordDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setCurrentPw("");
    setNewPw("");
    setConfirmPw("");
    setError("");
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSubmit = () => {
    setError("");
    if (currentPw !== getAdminPassword()) {
      setError("Current password is incorrect.");
      return;
    }
    if (newPw.length < 6) {
      setError("New password must be at least 6 characters.");
      return;
    }
    if (newPw === currentPw) {
      setError("New password must differ from current password.");
      return;
    }
    if (newPw !== confirmPw) {
      setError("Passwords do not match.");
      return;
    }
    setSaving(true);
    setTimeout(() => {
      localStorage.setItem("cvr_admin_password", newPw);
      setSaving(false);
      toast.success("Password changed successfully!");
      handleClose();
    }, 400);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent
        className="bg-card border-border max-w-[360px]"
        data-ocid="change_password.dialog"
      >
        <DialogHeader>
          <DialogTitle className="font-display text-lg flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-orange-glow" />
            CHANGE PASSWORD
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label className="font-display text-xs text-muted-foreground">
              CURRENT PASSWORD
            </Label>
            <Input
              type="password"
              value={currentPw}
              onChange={(e) => setCurrentPw(e.target.value)}
              placeholder="Current password"
              className="bg-secondary border-border text-sm"
              data-ocid="change_password.input"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="font-display text-xs text-muted-foreground">
              NEW PASSWORD
            </Label>
            <Input
              type="password"
              value={newPw}
              onChange={(e) => setNewPw(e.target.value)}
              placeholder="Min 6 characters"
              className="bg-secondary border-border text-sm"
              data-ocid="change_password.input"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="font-display text-xs text-muted-foreground">
              CONFIRM NEW PASSWORD
            </Label>
            <Input
              type="password"
              value={confirmPw}
              onChange={(e) => setConfirmPw(e.target.value)}
              placeholder="Repeat new password"
              className="bg-secondary border-border text-sm"
              data-ocid="change_password.input"
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            />
          </div>

          {error && (
            <p
              className="text-destructive text-xs"
              data-ocid="change_password.error_state"
            >
              {error}
            </p>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={handleClose}
            className="text-xs"
            data-ocid="change_password.cancel_button"
          >
            CANCEL
          </Button>
          <Button
            className="btn-primary text-xs"
            onClick={handleSubmit}
            disabled={saving}
            data-ocid="change_password.confirm_button"
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin mr-1" />
            ) : (
              <Lock className="w-4 h-4 mr-1" />
            )}
            UPDATE PASSWORD
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── GameEditDialog ──────────────────────────────────────────────────────────
function GameEditDialog({
  game,
  open,
  onClose,
  onSave,
  isSaving,
}: {
  game: Partial<GameTile> & typeof EMPTY_GAME;
  open: boolean;
  onClose: () => void;
  onSave: (g: GameTile, isNew: boolean) => void;
  isSaving: boolean;
}) {
  const [form, setForm] = useState<Omit<GameTile, "id"> & { id?: bigint }>(
    game,
  );
  const [bgVideoUrl, setBgVideoUrl] = useState<string | null>(null);
  const [bannerUploading, setBannerUploading] = useState(false);

  // Load bg video from IndexedDB when dialog opens
  useEffect(() => {
    const gameId = form.id?.toString() ?? "new";
    loadVideo(`cvr_bgvideo_game_${gameId}`).then(setBgVideoUrl);
  }, [form.id]);

  const parseQText = (raw: string): { text: string; imageUrl?: string } => {
    try {
      const p = JSON.parse(raw);
      if (typeof p.text === "string") {
        return { text: p.text, imageUrl: p.imageUrl || undefined };
      }
    } catch {}
    return { text: raw };
  };

  const encodeQText = (text: string, imageUrl?: string): string =>
    imageUrl ? JSON.stringify({ text, imageUrl }) : text;

  const updateField = <K extends keyof typeof form>(
    key: K,
    value: (typeof form)[K],
  ) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const addQuestion = () => {
    const newQ: Question = {
      id: BigInt(Date.now()),
      questionText: "",
      required: false,
      fieldType: "text",
    };
    setForm((prev) => ({ ...prev, questions: [...prev.questions, newQ] }));
  };

  const updateQuestion = (
    idx: number,
    field: keyof Question,
    value: string | boolean | bigint,
  ) => {
    setForm((prev) => ({
      ...prev,
      questions: prev.questions.map((q, i) =>
        i === idx ? { ...q, [field]: value } : q,
      ),
    }));
  };

  const removeQuestion = (idx: number) => {
    setForm((prev) => ({
      ...prev,
      questions: prev.questions.filter((_, i) => i !== idx),
    }));
  };

  const handleSave = () => {
    if (!form.title.trim()) {
      toast.error("Title is required");
      return;
    }
    const _isNew = form.id === undefined || form.id === null;
    onSave({ ...form, id: form.id ?? BigInt(0) } as GameTile, _isNew);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => !v && onClose()}
      data-ocid="game_edit.dialog"
    >
      <DialogContent
        className="bg-card border-border max-w-[420px] max-h-[85vh] overflow-y-auto"
        data-ocid="game_edit.dialog"
      >
        <DialogHeader>
          <DialogTitle className="font-display text-lg text-foreground">
            {form.id ? "EDIT GAME" : "ADD NEW GAME"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label className="font-display text-xs text-muted-foreground">
              GAME TITLE *
            </Label>
            <Input
              value={form.title}
              onChange={(e) => updateField("title", e.target.value)}
              placeholder="e.g. BGMI Championship"
              className="bg-secondary border-border text-sm"
              data-ocid="game_edit.input"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="font-display text-xs text-muted-foreground">
              DESCRIPTION
            </Label>
            <Input
              value={form.description}
              onChange={(e) => updateField("description", e.target.value)}
              placeholder="Tournament description"
              className="bg-secondary border-border text-sm"
              data-ocid="game_edit.input"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="font-display text-xs text-muted-foreground">
              PLATFORM
            </Label>
            <Select
              value={form.platform}
              onValueChange={(v) => updateField("platform", v)}
            >
              <SelectTrigger
                className="bg-secondary border-border text-sm"
                data-ocid="game_edit.select"
              >
                <SelectValue placeholder="— Select Platform —" />
              </SelectTrigger>
              <SelectContent className="bg-card border-border">
                <SelectItem value="-">— Select Platform —</SelectItem>
                <SelectItem value="Android / iOS">Android / iOS</SelectItem>
                <SelectItem value="PC">PC</SelectItem>
                <SelectItem value="Console">Console</SelectItem>
                <SelectItem value="Cross-Platform">Cross-Platform</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="font-display text-xs text-muted-foreground">
              ENTRY FEE (₹)
            </Label>
            <Input
              type="number"
              value={form.entryFee.toString()}
              onChange={(e) =>
                updateField("entryFee", BigInt(e.target.value || "0"))
              }
              placeholder="0"
              className="bg-secondary border-border text-sm"
              data-ocid="game_edit.input"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="font-display text-xs text-muted-foreground">
              BANNER IMAGE (optional)
            </Label>
            <div className="space-y-2">
              {form.bannerUrl && (
                <div className="relative">
                  <img
                    src={form.bannerUrl}
                    alt="Banner preview"
                    className="w-full h-24 object-cover rounded border border-border"
                  />
                  <Button
                    type="button"
                    variant="destructive"
                    size="icon"
                    className="absolute top-1 right-1 w-6 h-6"
                    onClick={() => {
                      updateField("bannerUrl", "");
                    }}
                  >
                    <X className="w-3 h-3" />
                  </Button>
                </div>
              )}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                id="banner-upload-input"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  e.target.value = "";
                  setBannerUploading(true);
                  try {
                    console.log("[Banner Upload] Starting upload...");
                    console.log(
                      "[Banner Upload] File:",
                      file.name,
                      file.type,
                      file.size,
                      "bytes",
                    );
                    const arrayBuffer = await file.arrayBuffer();
                    const bytes = new Uint8Array(arrayBuffer);
                    const config = await loadConfig();
                    console.log(
                      "[Banner Upload] Gateway URL:",
                      config.storage_gateway_url,
                    );
                    const agent = new HttpAgent({ host: config.backend_host });
                    if (config.backend_host?.includes("localhost")) {
                      await agent.fetchRootKey().catch(() => {});
                    }
                    const client = new StorageClient(
                      config.bucket_name,
                      config.storage_gateway_url,
                      config.backend_canister_id,
                      config.project_id,
                      agent,
                    );
                    const { hash } = await client.putFile(bytes);
                    console.log("[Banner Upload] Hash:", hash);
                    const url = await client.getDirectURL(hash);
                    console.log("[Banner Upload] Public URL:", url);
                    updateField("bannerUrl", url);
                  } catch (err) {
                    console.error("[Banner Upload] FAILED:", err);
                    const msg =
                      err instanceof Error ? err.message : String(err);
                    toast.error(`Banner upload failed: ${msg}`);
                  } finally {
                    setBannerUploading(false);
                  }
                }}
              />
              <Button
                type="button"
                variant="outline"
                className="w-full text-xs border-dashed"
                disabled={bannerUploading}
                onClick={() =>
                  document.getElementById("banner-upload-input")?.click()
                }
              >
                <ImagePlus className="w-4 h-4 mr-2" />
                {bannerUploading
                  ? "UPLOADING..."
                  : form.bannerUrl
                    ? "CHANGE BANNER"
                    : "UPLOAD BANNER"}
              </Button>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="font-display text-xs text-muted-foreground">
              BACKGROUND VIDEO (optional, unique per game)
            </Label>
            <div className="space-y-2">
              {bgVideoUrl && (
                <div className="relative">
                  <video
                    src={bgVideoUrl}
                    className="w-full h-24 object-cover rounded border border-border"
                    muted
                    playsInline
                    preload="metadata"
                  />
                  <Button
                    type="button"
                    variant="destructive"
                    size="icon"
                    className="absolute top-1 right-1 w-6 h-6"
                    onClick={() => {
                      const gameId = form.id?.toString() ?? "new";
                      deleteVideo(`cvr_bgvideo_game_${gameId}`).then(() => {
                        setBgVideoUrl(null);
                      });
                    }}
                  >
                    <X className="w-3 h-3" />
                  </Button>
                </div>
              )}
              <input
                type="file"
                accept="video/*"
                className="hidden"
                id="bgvideo-upload-input"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const gameId = form.id?.toString() ?? "new";
                  saveVideo(`cvr_bgvideo_game_${gameId}`, file).then(() => {
                    loadVideo(`cvr_bgvideo_game_${gameId}`).then(setBgVideoUrl);
                  });
                  e.target.value = "";
                }}
              />
              <Button
                type="button"
                variant="outline"
                className="w-full text-xs border-dashed"
                onClick={() =>
                  document.getElementById("bgvideo-upload-input")?.click()
                }
              >
                <Video className="w-4 h-4 mr-2" />
                {bgVideoUrl ? "CHANGE BG VIDEO" : "UPLOAD BG VIDEO"}
              </Button>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <Label className="font-display text-xs text-muted-foreground">
              REGISTRATION OPEN
            </Label>
            <Switch
              checked={form.isOpen}
              onCheckedChange={(v) => updateField("isOpen", v)}
              data-ocid="game_edit.switch"
            />
          </div>

          {/* Custom Questions */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label className="font-display text-xs text-muted-foreground">
                CUSTOM QUESTIONS
              </Label>
              <Button
                size="sm"
                variant="outline"
                className="btn-outline-orange text-xs h-7 px-2"
                onClick={addQuestion}
                data-ocid="game_edit.secondary_button"
              >
                <Plus className="w-3 h-3 mr-1" /> ADD FIELD
              </Button>
            </div>

            <div className="space-y-2">
              {form.questions.map((q, idx) => (
                <div
                  key={q.id.toString()}
                  className="bg-secondary rounded-lg p-2 space-y-2"
                  data-ocid={`game_edit.item.${idx + 1}`}
                >
                  {/* Question text + optional image */}
                  {(() => {
                    const parsed = parseQText(q.questionText);
                    return (
                      <div className="space-y-2">
                        <div className="flex gap-2">
                          <Input
                            value={parsed.text}
                            onChange={(e) =>
                              updateQuestion(
                                idx,
                                "questionText",
                                encodeQText(e.target.value, parsed.imageUrl),
                              )
                            }
                            placeholder="Question text"
                            className="bg-card border-border text-xs flex-1"
                          />
                          <button
                            type="button"
                            onClick={() => removeQuestion(idx)}
                            className="text-muted-foreground hover:text-destructive"
                            data-ocid={`game_edit.delete_button.${idx + 1}`}
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                        {/* Question image preview + upload/remove */}
                        {parsed.imageUrl ? (
                          <div className="relative inline-block">
                            <img
                              src={parsed.imageUrl}
                              alt="Question context"
                              className="h-20 rounded object-contain border border-border/50"
                            />
                            <button
                              type="button"
                              className="absolute -top-1.5 -right-1.5 bg-destructive rounded-full w-4 h-4 flex items-center justify-center text-white"
                              onClick={() => {
                                updateQuestion(
                                  idx,
                                  "questionText",
                                  encodeQText(parsed.text, undefined),
                                );
                              }}
                            >
                              <X className="w-2.5 h-2.5" />
                            </button>
                          </div>
                        ) : (
                          <label className="flex items-center gap-1.5 cursor-pointer text-muted-foreground hover:text-orange-glow text-xs w-fit">
                            <ImagePlus className="w-3.5 h-3.5" />
                            <span>Add photo to question</span>
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={async (e) => {
                                const file = e.target.files?.[0];
                                if (!file) return;
                                if (file.size > 2 * 1024 * 1024) {
                                  toast.error("Max 2 MB");
                                  return;
                                }
                                e.target.value = "";
                                try {
                                  console.log(
                                    "[Question Image Upload] Starting upload...",
                                  );
                                  console.log(
                                    "[Question Image Upload] File:",
                                    file.name,
                                    file.type,
                                    file.size,
                                    "bytes",
                                  );
                                  const arrayBuffer = await file.arrayBuffer();
                                  const bytes = new Uint8Array(arrayBuffer);
                                  const config = await loadConfig();
                                  console.log(
                                    "[Question Image Upload] Gateway URL:",
                                    config.storage_gateway_url,
                                  );
                                  const agent = new HttpAgent({
                                    host: config.backend_host,
                                  });
                                  if (
                                    config.backend_host?.includes("localhost")
                                  ) {
                                    await agent.fetchRootKey().catch(() => {});
                                  }
                                  const client = new StorageClient(
                                    config.bucket_name,
                                    config.storage_gateway_url,
                                    config.backend_canister_id,
                                    config.project_id,
                                    agent,
                                  );
                                  const { hash } = await client.putFile(bytes);
                                  console.log(
                                    "[Question Image Upload] Hash:",
                                    hash,
                                  );
                                  const url = await client.getDirectURL(hash);
                                  console.log(
                                    "[Question Image Upload] Public URL:",
                                    url,
                                  );
                                  updateQuestion(
                                    idx,
                                    "questionText",
                                    encodeQText(parsed.text, url),
                                  );
                                } catch (err) {
                                  console.error(
                                    "[Question Image Upload] FAILED:",
                                    err,
                                  );
                                  const msg =
                                    err instanceof Error
                                      ? err.message
                                      : String(err);
                                  toast.error(`Image upload failed: ${msg}`);
                                }
                              }}
                            />
                          </label>
                        )}
                      </div>
                    );
                  })()}
                  <div className="flex gap-2 items-center">
                    <Select
                      value={q.fieldType}
                      onValueChange={(v) => updateQuestion(idx, "fieldType", v)}
                    >
                      <SelectTrigger className="bg-card border-border text-xs h-7 flex-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-card border-border">
                        <SelectItem value="text">Text</SelectItem>
                        <SelectItem value="number">Number</SelectItem>
                        <SelectItem value="photo">
                          Photo (user uploads image)
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <div className="flex items-center gap-1.5">
                      <Switch
                        checked={q.required}
                        onCheckedChange={(v) =>
                          updateQuestion(idx, "required", v)
                        }
                        className="scale-75"
                      />
                      <span className="text-muted-foreground text-xs">
                        Required
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={onClose}
            className="text-xs"
            data-ocid="game_edit.cancel_button"
          >
            CANCEL
          </Button>
          <Button
            className="btn-primary text-xs"
            onClick={handleSave}
            disabled={isSaving}
            data-ocid="game_edit.save_button"
          >
            {isSaving ? (
              <Loader2 className="w-4 h-4 animate-spin mr-1" />
            ) : (
              <Save className="w-4 h-4 mr-1" />
            )}
            SAVE
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface StoredBgElement {
  id: string;
  dataUrl: string;
  name: string;
}

interface StoredSponsor {
  id: string;
  name: string;
  mediaUrl: string;
  mediaType: "image" | "video";
}

function useSponsors() {
  const [sponsors, setSponsors] = useState<StoredSponsor[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchSponsors = async () => {
    try {
      const actor = await createActorWithConfig();
      const list = await (actor as any).getSponsors();
      setSponsors(
        list.map((s) => ({
          id: s.id.toString(),
          name: s.name,
          mediaUrl: s.mediaUrl,
          mediaType: s.mediaType as "image" | "video",
        })),
      );
    } catch (err) {
      console.error("Failed to load sponsors:", err);
    }
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: fetch on mount only
  useEffect(() => {
    fetchSponsors();
  }, []);

  const add = async (s: StoredSponsor) => {
    setLoading(true);
    try {
      const actor = await createActorWithConfig();
      await (actor as any).addSponsor(s.name, s.mediaUrl, s.mediaType);
      await fetchSponsors();
    } catch (err) {
      console.error("Failed to add sponsor:", err);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const remove = async (id: string) => {
    try {
      const actor = await createActorWithConfig();
      await (actor as any).deleteSponsor(BigInt(id));
      await fetchSponsors();
    } catch (err) {
      console.error("Failed to remove sponsor:", err);
      throw err;
    }
  };

  return { sponsors, add, remove, loading };
}

function useBgElements() {
  const [elements, setElements] = useState<StoredBgElement[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("cvr_bg_elements");
      if (raw) setElements(JSON.parse(raw));
    } catch {
      // ignore
    }
  }, []);

  const save = (els: StoredBgElement[]) => {
    localStorage.setItem("cvr_bg_elements", JSON.stringify(els));
    setElements(els);
    window.dispatchEvent(
      new StorageEvent("storage", { key: "cvr_bg_elements" }),
    );
  };

  const add = (el: StoredBgElement) => save([...elements, el]);
  const remove = (id: string) => save(elements.filter((e) => e.id !== id));

  return { elements, add, remove, save };
}

// ── Session Timer ────────────────────────────────────────────────────────────
function useSessionTimer(loginTime: number) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - loginTime) / 60000));
    }, 60000);
    return () => clearInterval(id);
  }, [loginTime]);
  return elapsed;
}

const ADMIN_CACHE_KEY = "cvr_games_cache";
function adminSafeParse(raw: string): GameTile[] {
  try {
    return JSON.parse(raw, (_key, value) =>
      value && typeof value === "object" && "__bigint__" in value
        ? BigInt((value as { __bigint__: string }).__bigint__)
        : value,
    ) as GameTile[];
  } catch {
    return [];
  }
}

// ── AdminPage ────────────────────────────────────────────────────────────────
export default function AdminPage() {
  const navigate = useNavigate();
  const { identity, login, loginStatus, clear } = useInternetIdentity();
  const { isLoading: adminLoading } = useIsAdmin();
  const [cachedGames, setCachedGames] = useState<GameTile[]>(() => {
    try {
      const raw = localStorage.getItem(ADMIN_CACHE_KEY);
      if (raw) return adminSafeParse(raw);
    } catch {
      /* ignore */
    }
    return [];
  });
  const { actor, isFetching: actorFetching } = useActor();
  const { data: backendGames, isLoading: gamesLoading } = useListAllGames();
  const games =
    backendGames && backendGames.length > 0 ? backendGames : cachedGames;
  const { data: stripeConfigured } = useIsStripeConfigured();

  const createGame = useCreateGame();
  const updateGame = useUpdateGame();
  const deleteGame = useDeleteGame();
  const setStripeConfig = useSetStripeConfiguration();
  const updatePaymentStatus = useUpdatePaymentStatus();

  const [passAuth, setPassAuth] = useState<boolean>(
    () => localStorage.getItem("cvr_admin_pass") === "ok",
  );
  const [passwordInput, setPasswordInput] = useState("");
  const [passwordError, setPasswordError] = useState("");

  const [loginTime] = useState(() => Date.now());
  const sessionMinutes = useSessionTimer(loginTime);

  const [showChangePw, setShowChangePw] = useState(false);

  const [editingGame, setEditingGame] = useState<
    (Omit<GameTile, "id"> & { id?: bigint }) | null
  >(null);
  const [selectedGameId, setSelectedGameId] = useState<bigint | null>(null);
  const { data: registrations, isLoading: regsLoading } =
    useGetGameRegistrations(selectedGameId);

  const [toggleLoadingId, setToggleLoadingId] = useState<bigint | null>(null);
  const [paymentToggling, setPaymentToggling] = useState<bigint | null>(null);

  const [stripeKey, setStripeKey] = useState("");
  const [stripeCountries, setStripeCountries] = useState("IN");

  const [statPlayers, setStatPlayers] = useState(() => {
    try {
      return (
        JSON.parse(localStorage.getItem("cvr_stats") || "{}").players || "-"
      );
    } catch {
      return "-";
    }
  });
  const [statTournaments, setStatTournaments] = useState(() => {
    try {
      return (
        JSON.parse(localStorage.getItem("cvr_stats") || "{}").tournaments || "-"
      );
    } catch {
      return "-";
    }
  });
  const [statPrizePool, setStatPrizePool] = useState(() => {
    try {
      return (
        JSON.parse(localStorage.getItem("cvr_stats") || "{}").prizePool || "-"
      );
    } catch {
      return "-";
    }
  });

  const handleSaveStats = () => {
    const data = {
      players: statPlayers,
      tournaments: statTournaments,
      prizePool: statPrizePool,
    };
    localStorage.setItem("cvr_stats", JSON.stringify(data));
    window.dispatchEvent(
      new StorageEvent("storage", {
        key: "cvr_stats",
        newValue: JSON.stringify(data),
      }),
    );
    toast.success("Stats saved!");
  };

  const {
    elements: bgElements,
    add: addBgElement,
    remove: removeBgElement,
    save: saveBgElements,
  } = useBgElements();
  const bgFileRef = useRef<HTMLInputElement>(null);
  const sponsorFileRef = useRef<HTMLInputElement>(null);
  const { sponsors, add: addSponsor, remove: removeSponsor } = useSponsors();
  const [sponsorName, setSponsorName] = useState("");
  const [sponsorUploading, setSponsorUploading] = useState(false);

  const handleSaveGame = async (game: GameTile, isNew = false) => {
    if (!actor) {
      toast.error(
        "Still connecting to network, please wait a moment and try again.",
      );
      return;
    }
    try {
      if (isNew) {
        await createGame.mutateAsync(game);
        toast.success("Game created!");
      } else {
        try {
          await updateGame.mutateAsync(game);
          toast.success("Game updated!");
        } catch (updateErr) {
          // Only fall back to createGame if the backend says the game doesn't exist.
          // For network errors we re-throw so the user sees the real problem.
          const errMsg = String(updateErr);
          if (
            errMsg.includes("Game not found") ||
            errMsg.includes("not found")
          ) {
            await createGame.mutateAsync(game);
            toast.success("Game saved!");
          } else {
            throw updateErr;
          }
        }
      }
      localStorage.removeItem("cvr_games_cache");
      setCachedGames([]);
      setEditingGame(null);
    } catch (_err) {
      console.error("Save game error:", _err);
      toast.error("Failed to save game. Please try again.");
    }
  };

  const handleDelete = async (id: bigint) => {
    if (!confirm("Delete this game?")) return;
    try {
      await deleteGame.mutateAsync(id);
      toast.success("Game deleted");
    } catch {
      toast.error("Failed to delete");
    }
  };

  const handleToggleOpen = async (game: GameTile) => {
    setToggleLoadingId(game.id);
    try {
      await updateGame.mutateAsync({ ...game, isOpen: !game.isOpen });
      toast.success(game.isOpen ? "Game closed" : "Game opened");
    } catch {
      toast.error("Failed to toggle status");
    } finally {
      setToggleLoadingId(null);
    }
  };

  const handleTogglePayment = async (regId: bigint, currentStatus: string) => {
    const newStatus = currentStatus === "paid" ? "pending" : "paid";
    setPaymentToggling(regId);
    try {
      await updatePaymentStatus.mutateAsync({ regId, status: newStatus });
      toast.success(`Payment marked as ${newStatus}`);
    } catch {
      toast.error("Failed to update payment");
    } finally {
      setPaymentToggling(null);
    }
  };

  const handleExportCSV = () => {
    if (!registrations || registrations.length === 0) {
      toast.error("No registrations to export");
      return;
    }
    const header = ["#", "Player", "UID", "IGN", "Payment Status"];
    const rows = registrations.map((r, i) => [
      i + 1,
      r.playerName,
      r.uid,
      r.inGameName,
      r.paymentStatus,
    ]);
    const csv = [header, ...rows]
      .map((row) => row.map((v) => `"${v}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `registrations_${selectedGameId?.toString() ?? "export"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV exported!");
  };

  const handleSaveStripe = async () => {
    try {
      await setStripeConfig.mutateAsync({
        secretKey: stripeKey,
        allowedCountries: stripeCountries.split(",").map((c) => c.trim()),
      });
      toast.success("Stripe configuration saved!");
    } catch {
      toast.error("Failed to save Stripe config");
    }
  };

  const handleResetStats = () => {
    if (!window.confirm("Reset all stats to '-'? This cannot be undone."))
      return;
    const data = { players: "-", tournaments: "-", prizePool: "-" };
    localStorage.setItem("cvr_stats", JSON.stringify(data));
    window.dispatchEvent(
      new StorageEvent("storage", {
        key: "cvr_stats",
        newValue: JSON.stringify(data),
      }),
    );
    setStatPlayers("-");
    setStatTournaments("-");
    setStatPrizePool("-");
    toast.success("Stats reset to '-'");
  };

  const handleClearBgElements = () => {
    if (
      !window.confirm("Remove ALL background elements? This cannot be undone.")
    )
      return;
    saveBgElements([]);
    toast.success("Background elements cleared");
  };

  // ── Login Screen ──────────────────────────────────────────────────────────
  if (!identity && !passAuth) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <header className="sticky top-0 z-50 bg-steel-dark/95 backdrop-blur border-b border-border/50">
          <div className="max-w-[430px] mx-auto px-4 h-14 flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate({ to: "/" })}
              className="text-muted-foreground"
              data-ocid="admin.cancel_button"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <Shield className="w-5 h-5 text-orange-glow" fill="currentColor" />
            <span className="font-display text-sm font-bold">ADMIN</span>
          </div>
        </header>
        <div className="flex-1 flex items-center justify-center px-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center w-full max-w-[300px]"
          >
            <Shield
              className="w-16 h-16 text-orange-glow mx-auto mb-4 glow-orange"
              fill="currentColor"
            />
            <h2 className="font-display text-2xl font-bold mb-2">
              ADMIN ACCESS
            </h2>
            <p className="text-muted-foreground text-sm mb-6">
              Login with your identity to access the admin panel
            </p>
            <Button
              className="btn-primary w-full h-12 text-base glow-orange"
              onClick={() => login()}
              disabled={loginStatus === "logging-in"}
              data-ocid="admin.primary_button"
            >
              {loginStatus === "logging-in" ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin mr-2" />
                  LOGGING IN...
                </>
              ) : (
                "LOGIN"
              )}
            </Button>

            <div className="mt-4 w-full">
              <div className="flex items-center gap-2 mb-3">
                <div className="flex-1 h-px bg-border/50" />
                <span className="text-muted-foreground text-xs font-display">
                  OR
                </span>
                <div className="flex-1 h-px bg-border/50" />
              </div>
              <Input
                type="password"
                placeholder="Admin Password"
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                className="mb-2 bg-card border-border text-foreground"
                data-ocid="admin.input"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    if (passwordInput === getAdminPassword()) {
                      localStorage.setItem("cvr_admin_pass", "ok");
                      setPassAuth(true);
                      setPasswordError("");
                    } else {
                      setPasswordError("Incorrect password. Try again.");
                    }
                  }
                }}
              />
              {passwordError && (
                <p
                  className="text-destructive text-xs mb-2"
                  data-ocid="admin.error_state"
                >
                  {passwordError}
                </p>
              )}
              <Button
                className="btn-outline-orange w-full h-10 text-sm"
                data-ocid="admin.secondary_button"
                onClick={() => {
                  if (passwordInput === getAdminPassword()) {
                    localStorage.setItem("cvr_admin_pass", "ok");
                    setPassAuth(true);
                    setPasswordError("");
                  } else {
                    setPasswordError("Incorrect password. Try again.");
                  }
                }}
              >
                ENTER WITH PASSWORD
              </Button>
            </div>
          </motion.div>
        </div>
      </div>
    );
  }

  if (adminLoading && !passAuth) {
    return (
      <div
        className="min-h-screen bg-background flex items-center justify-center"
        data-ocid="admin.loading_state"
      >
        <Loader2 className="w-8 h-8 animate-spin text-orange-glow" />
      </div>
    );
  }

  if (!passAuth) {
    return (
      <div
        className="min-h-screen bg-background flex items-center justify-center"
        data-ocid="admin.error_state"
      >
        <div className="text-center">
          <p className="font-display text-xl text-destructive mb-2">
            ACCESS DENIED
          </p>
          <p className="text-muted-foreground text-sm mb-4">
            You don't have admin privileges.
          </p>
          <Button
            className="btn-outline-orange"
            onClick={() => navigate({ to: "/" })}
            data-ocid="admin.cancel_button"
          >
            GO HOME
          </Button>
        </div>
      </div>
    );
  }

  // ── Dashboard ────────────────────────────────────────────────────────────
  const totalGames = games?.length ?? 0;
  const openGames = games?.filter((g) => g.isOpen).length ?? 0;
  const totalRegistrations = registrations?.length ?? null;

  const overviewStats = [
    {
      icon: <Trophy className="w-4 h-4" />,
      label: "TOTAL GAMES",
      value: totalGames,
    },
    {
      icon: <Zap className="w-4 h-4" />,
      label: "OPEN GAMES",
      value: openGames,
    },
    {
      icon: <Users className="w-4 h-4" />,
      label: "REGS",
      value: totalRegistrations !== null ? totalRegistrations : "-",
    },
    {
      icon: <Layers className="w-4 h-4" />,
      label: "BG ELEMENTS",
      value: bgElements.length,
    },
  ];

  return (
    <div className="min-h-screen">
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
      {/* Header */}
      <header className="sticky top-0 z-50 bg-steel-dark/95 backdrop-blur border-b border-border/50">
        <div className="max-w-[430px] mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate({ to: "/" })}
              className="text-muted-foreground"
              data-ocid="admin.cancel_button"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <Shield className="w-5 h-5 text-orange-glow" fill="currentColor" />
            <span className="font-display text-sm font-bold">ADMIN PANEL</span>
          </div>
          <div className="flex items-center gap-2">
            {/* Session indicator */}
            <div className="flex items-center gap-1 text-muted-foreground text-xs">
              <Clock className="w-3 h-3" />
              <span>SESSION: {sessionMinutes}m</span>
            </div>
            {/* Change password key button */}
            <button
              type="button"
              className="text-muted-foreground hover:text-orange-glow transition-colors p-1"
              onClick={() => setShowChangePw(true)}
              title="Change Password"
              data-ocid="admin.open_modal_button"
            >
              <KeyRound className="w-4 h-4" />
            </button>
            <Button
              size="sm"
              variant="outline"
              className="btn-outline-orange text-xs h-8 px-3"
              onClick={() => {
                clear();
                localStorage.removeItem("cvr_admin_pass");
                setPassAuth(false);
              }}
              data-ocid="admin.secondary_button"
            >
              LOGOUT
            </Button>
          </div>
        </div>
      </header>

      <div className="max-w-[430px] mx-auto px-4 py-4">
        {/* ── Dashboard Overview ─────────────────────────────────────────── */}
        <div className="flex gap-2 overflow-x-auto pb-2 mb-4">
          {overviewStats.map((stat) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex-shrink-0 bg-card border border-border rounded-lg px-3 py-2.5 min-w-[90px] flex flex-col gap-1"
            >
              <div className="flex items-center gap-1.5 text-muted-foreground">
                {stat.icon}
                <span className="font-display text-[9px] tracking-wider">
                  {stat.label}
                </span>
              </div>
              <span className="font-display text-xl font-bold text-orange-glow">
                {stat.value}
              </span>
            </motion.div>
          ))}
        </div>

        {/* ── Tabs ──────────────────────────────────────────────────────── */}
        <Tabs defaultValue="games" data-ocid="admin.panel">
          <TabsList className="w-full bg-card border border-border mb-4">
            <TabsTrigger
              value="games"
              className="flex-1 font-display text-xs"
              data-ocid="admin.tab"
            >
              GAMES
            </TabsTrigger>
            <TabsTrigger
              value="registrations"
              className="flex-1 font-display text-xs"
              data-ocid="admin.tab"
            >
              REGS
            </TabsTrigger>
            <TabsTrigger
              value="settings"
              className="flex-1 font-display text-xs"
              data-ocid="admin.tab"
            >
              SETTINGS
            </TabsTrigger>
          </TabsList>

          {/* ── GAMES TAB ────────────────────────────────────────────────── */}
          <TabsContent value="games" data-ocid="admin.section">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display text-lg font-bold">MANAGE GAMES</h3>
              <Button
                size="sm"
                className="btn-primary text-xs h-8 px-3"
                onClick={() => setEditingGame({ ...EMPTY_GAME })}
                data-ocid="admin.primary_button"
              >
                <Plus className="w-3.5 h-3.5 mr-1" /> ADD GAME
              </Button>
            </div>

            {gamesLoading ? (
              <div className="space-y-3" data-ocid="admin.loading_state">
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="bg-card rounded-lg h-16 animate-pulse"
                  />
                ))}
              </div>
            ) : !games || games.length === 0 ? (
              <div
                className="text-center py-12 text-muted-foreground"
                data-ocid="admin.empty_state"
              >
                <p className="font-display text-sm">
                  NO GAMES YET. ADD YOUR FIRST ONE!
                </p>
              </div>
            ) : (
              <div className="space-y-3" data-ocid="admin.list">
                {games.map((game, i) => (
                  <motion.div
                    key={game.id.toString()}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className="bg-card border border-border rounded-lg p-3 flex items-center justify-between"
                    data-ocid={`admin.item.${i + 1}`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-display text-sm font-bold text-foreground truncate">
                        {game.title}
                      </div>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <Badge
                          variant="outline"
                          className="text-xs border-border/60 text-muted-foreground px-1.5 py-0"
                        >
                          {game.platform || "-"}
                        </Badge>
                        <span className="text-orange-glow text-xs font-bold">
                          {game.entryFee > BigInt(0)
                            ? `₹${game.entryFee.toString()}`
                            : "-"}
                        </span>
                        {/* Quick open/close toggle */}
                        <button
                          type="button"
                          className={`text-xs font-bold px-2 py-0.5 rounded-full transition-all border ${
                            game.isOpen
                              ? "bg-green-900/50 text-green-400 border-green-700/50 hover:bg-red-900/40 hover:text-red-400 hover:border-red-700/40"
                              : "bg-gray-800 text-gray-400 border-gray-700 hover:bg-green-900/40 hover:text-green-400 hover:border-green-700/40"
                          }`}
                          onClick={() => handleToggleOpen(game)}
                          disabled={toggleLoadingId === game.id}
                          data-ocid={`admin.toggle.${i + 1}`}
                        >
                          {toggleLoadingId === game.id ? (
                            <Loader2 className="w-3 h-3 animate-spin inline" />
                          ) : game.isOpen ? (
                            "OPEN"
                          ) : (
                            "CLOSED"
                          )}
                        </button>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 ml-2">
                      <button
                        type="button"
                        className="text-muted-foreground hover:text-orange-glow transition-colors"
                        onClick={() => setEditingGame(game)}
                        data-ocid={`admin.edit_button.${i + 1}`}
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        className="text-muted-foreground hover:text-destructive transition-colors"
                        onClick={() => handleDelete(game.id)}
                        data-ocid={`admin.delete_button.${i + 1}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </TabsContent>

          {/* ── REGISTRATIONS TAB ────────────────────────────────────────── */}
          <TabsContent value="registrations" data-ocid="admin.section">
            <h3 className="font-display text-lg font-bold mb-4">
              REGISTRATIONS
            </h3>

            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <Label className="font-display text-xs text-muted-foreground">
                  SELECT GAME
                </Label>
                <Button
                  size="sm"
                  variant="outline"
                  className="btn-outline-orange text-xs h-7 px-2"
                  onClick={handleExportCSV}
                  disabled={!registrations || registrations.length === 0}
                  data-ocid="admin.secondary_button"
                >
                  <Download className="w-3 h-3 mr-1" /> EXPORT CSV
                </Button>
              </div>
              <Select
                value={selectedGameId?.toString() ?? ""}
                onValueChange={(v) => setSelectedGameId(v ? BigInt(v) : null)}
              >
                <SelectTrigger
                  className="bg-card border-border"
                  data-ocid="admin.select"
                >
                  <SelectValue placeholder="Choose a game..." />
                </SelectTrigger>
                <SelectContent className="bg-card border-border">
                  {games?.map((g) => (
                    <SelectItem key={g.id.toString()} value={g.id.toString()}>
                      {g.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedGameId === null ? (
              <p
                className="text-muted-foreground text-sm text-center py-8"
                data-ocid="admin.empty_state"
              >
                Select a game to view registrations
              </p>
            ) : regsLoading ? (
              <div className="text-center py-8" data-ocid="admin.loading_state">
                <Loader2 className="w-6 h-6 animate-spin text-orange-glow mx-auto" />
              </div>
            ) : !registrations || registrations.length === 0 ? (
              <div
                className="text-center py-8 text-muted-foreground"
                data-ocid="admin.empty_state"
              >
                <p className="font-display text-sm">NO REGISTRATIONS YET</p>
              </div>
            ) : (
              <div className="overflow-x-auto" data-ocid="admin.table">
                <Table>
                  <TableHeader>
                    <TableRow className="border-border">
                      <TableHead className="font-display text-xs text-muted-foreground">
                        #
                      </TableHead>
                      <TableHead className="font-display text-xs text-muted-foreground">
                        PLAYER
                      </TableHead>
                      <TableHead className="font-display text-xs text-muted-foreground">
                        UID
                      </TableHead>
                      <TableHead className="font-display text-xs text-muted-foreground">
                        IGN
                      </TableHead>
                      <TableHead className="font-display text-xs text-muted-foreground">
                        PAYMENT
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {registrations.map((reg, i) => (
                      <TableRow
                        key={reg.id.toString()}
                        className="border-border"
                        data-ocid={`admin.row.${i + 1}`}
                      >
                        <TableCell className="text-xs text-muted-foreground">
                          {i + 1}
                        </TableCell>
                        <TableCell className="text-xs font-medium">
                          {reg.playerName}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {reg.uid}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {reg.inGameName}
                        </TableCell>
                        <TableCell>
                          <button
                            type="button"
                            className={`text-xs font-bold px-2 py-0.5 rounded-full border transition-all ${
                              reg.paymentStatus === "paid"
                                ? "bg-green-900/50 text-green-400 border-green-700/50 hover:bg-yellow-900/40 hover:text-yellow-400"
                                : "bg-yellow-900/50 text-yellow-400 border-yellow-700/50 hover:bg-green-900/40 hover:text-green-400"
                            }`}
                            onClick={() =>
                              handleTogglePayment(reg.id, reg.paymentStatus)
                            }
                            disabled={paymentToggling === reg.id}
                            data-ocid={`admin.toggle.${i + 1}`}
                          >
                            {paymentToggling === reg.id ? (
                              <Loader2 className="w-3 h-3 animate-spin inline" />
                            ) : (
                              reg.paymentStatus.toUpperCase()
                            )}
                          </button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>

          {/* ── SETTINGS TAB ──────────────────────────────────────────────── */}
          <TabsContent value="settings" data-ocid="admin.section">
            <h3 className="font-display text-lg font-bold mb-4">SETTINGS</h3>

            {/* Site Stats */}
            <div className="bg-card border border-border rounded-lg p-4 space-y-4 mb-4">
              <h4 className="font-display text-sm text-foreground">
                SITE STATS
              </h4>

              <div className="space-y-1.5">
                <Label className="font-display text-xs text-muted-foreground">
                  PLAYERS
                </Label>
                <Input
                  value={statPlayers}
                  onChange={(e) => setStatPlayers(e.target.value)}
                  placeholder="-"
                  className="bg-secondary border-border text-sm"
                  data-ocid="admin.input"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="font-display text-xs text-muted-foreground">
                  TOURNAMENTS
                </Label>
                <Input
                  value={statTournaments}
                  onChange={(e) => setStatTournaments(e.target.value)}
                  placeholder="-"
                  className="bg-secondary border-border text-sm"
                  data-ocid="admin.input"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="font-display text-xs text-muted-foreground">
                  PRIZE POOL
                </Label>
                <Input
                  value={statPrizePool}
                  onChange={(e) => setStatPrizePool(e.target.value)}
                  placeholder="-"
                  className="bg-secondary border-border text-sm"
                  data-ocid="admin.input"
                />
              </div>

              <Button
                className="btn-primary w-full"
                onClick={handleSaveStats}
                data-ocid="admin.save_button"
              >
                <Save className="w-4 h-4 mr-2" />
                SAVE STATS
              </Button>
            </div>

            {/* Stripe */}
            <div className="bg-card border border-border rounded-lg p-4 space-y-4 mb-4">
              <div className="flex items-center justify-between">
                <h4 className="font-display text-sm text-foreground">
                  STRIPE PAYMENTS
                </h4>
                <Badge
                  className={
                    stripeConfigured
                      ? "bg-green-900/50 text-green-400"
                      : "bg-yellow-900/50 text-yellow-400"
                  }
                >
                  {stripeConfigured ? "CONFIGURED" : "NOT SET"}
                </Badge>
              </div>

              <div className="space-y-1.5">
                <Label className="font-display text-xs text-muted-foreground">
                  SECRET KEY
                </Label>
                <Input
                  type="password"
                  value={stripeKey}
                  onChange={(e) => setStripeKey(e.target.value)}
                  placeholder="sk_live_..."
                  className="bg-secondary border-border text-sm"
                  data-ocid="admin.input"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="font-display text-xs text-muted-foreground">
                  ALLOWED COUNTRIES (comma-separated)
                </Label>
                <Input
                  value={stripeCountries}
                  onChange={(e) => setStripeCountries(e.target.value)}
                  placeholder="IN, US, GB"
                  className="bg-secondary border-border text-sm"
                  data-ocid="admin.input"
                />
              </div>

              <Button
                className="btn-primary w-full"
                onClick={handleSaveStripe}
                disabled={setStripeConfig.isPending || !stripeKey.trim()}
                data-ocid="admin.save_button"
              >
                {setStripeConfig.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <Save className="w-4 h-4 mr-2" />
                )}
                SAVE STRIPE CONFIG
              </Button>
            </div>

            {/* Sponsors */}
            <div className="bg-card border border-border rounded-lg p-4 space-y-4 mb-4">
              <h4 className="font-display text-sm text-foreground">SPONSORS</h4>
              <p className="text-muted-foreground text-xs">
                Add sponsor images or videos. They appear as an Instagram-style
                slideshow on the homepage, below the tournaments section.
              </p>

              <div className="space-y-1.5">
                <Label className="font-display text-xs text-muted-foreground">
                  SPONSOR NAME (optional)
                </Label>
                <Input
                  value={sponsorName}
                  onChange={(e) => setSponsorName(e.target.value)}
                  placeholder="e.g. Red Bull, Logitech"
                  className="bg-secondary border-border text-sm"
                  data-ocid="sponsors.input"
                />
              </div>

              <input
                ref={sponsorFileRef}
                type="file"
                accept="image/jpeg,image/png,video/mp4"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  // File type validation
                  const allowedTypes = ["image/jpeg", "image/png", "video/mp4"];
                  if (!allowedTypes.includes(file.type)) {
                    toast.error(
                      "Invalid file type. Only JPG, PNG, and MP4 are supported.",
                    );
                    return;
                  }
                  // File size validation (5MB)
                  if (file.size > 5 * 1024 * 1024) {
                    toast.error("File too large. Maximum size is 5MB.");
                    return;
                  }
                  e.target.value = "";
                  setSponsorUploading(true);
                  try {
                    console.log("[Sponsor Upload] Starting upload...");
                    console.log(
                      "[Sponsor Upload] File:",
                      file.name,
                      file.type,
                      file.size,
                      "bytes",
                    );
                    const arrayBuffer = await file.arrayBuffer();
                    const bytes = new Uint8Array(arrayBuffer);
                    const config = await loadConfig();
                    console.log(
                      "[Sponsor Upload] Gateway URL:",
                      config.storage_gateway_url,
                    );
                    const agent = new HttpAgent({ host: config.backend_host });
                    if (config.backend_host?.includes("localhost")) {
                      await agent.fetchRootKey().catch(() => {});
                    }
                    const client = new StorageClient(
                      config.bucket_name,
                      config.storage_gateway_url,
                      config.backend_canister_id,
                      config.project_id,
                      agent,
                    );
                    const { hash } = await client.putFile(bytes);
                    console.log("[Sponsor Upload] Hash:", hash);
                    const url = await client.getDirectURL(hash);
                    console.log("[Sponsor Upload] Public URL:", url);
                    const mediaType = file.type.startsWith("video/")
                      ? "video"
                      : "image";
                    await addSponsor({
                      id: `sponsor_${Date.now()}`,
                      name: sponsorName.trim(),
                      mediaUrl: url,
                      mediaType: mediaType as "image" | "video",
                    });
                    setSponsorName("");
                    toast.success("Sponsor added!");
                  } catch (err) {
                    console.error("[Sponsor Upload] FAILED:", err);
                    const msg =
                      err instanceof Error ? err.message : String(err);
                    toast.error(`Upload failed: ${msg}`);
                  } finally {
                    setSponsorUploading(false);
                  }
                }}
                data-ocid="sponsors.upload_button"
              />
              <Button
                variant="outline"
                className="btn-outline-orange w-full text-xs"
                disabled={sponsorUploading}
                onClick={() => sponsorFileRef.current?.click()}
                data-ocid="sponsors.upload_button"
              >
                {sponsorUploading ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <ImagePlus className="w-4 h-4 mr-2" />
                )}
                {sponsorUploading
                  ? "UPLOADING..."
                  : "ADD SPONSOR (IMAGE / VIDEO)"}
              </Button>

              {sponsors.length === 0 ? (
                <p
                  className="text-muted-foreground text-xs text-center py-2"
                  data-ocid="sponsors.empty_state"
                >
                  No sponsors added yet.
                </p>
              ) : (
                <div className="space-y-2" data-ocid="sponsors.list">
                  {sponsors.map((s, i) => (
                    <div
                      key={s.id}
                      className="flex items-center gap-3 bg-secondary rounded-lg px-3 py-2"
                      data-ocid={`sponsors.item.${i + 1}`}
                    >
                      {s.mediaType === "video" ? (
                        <video
                          src={s.mediaUrl}
                          muted
                          className="w-12 h-8 object-cover rounded flex-shrink-0"
                        />
                      ) : (
                        <img
                          src={s.mediaUrl}
                          alt={s.name}
                          className="w-12 h-8 object-cover rounded flex-shrink-0"
                        />
                      )}
                      <span className="text-xs text-muted-foreground flex-1 truncate">
                        {s.name || "(no name)"}
                      </span>
                      <span className="text-xs text-muted-foreground/60 capitalize mr-1">
                        {s.mediaType}
                      </span>
                      <button
                        type="button"
                        className="text-muted-foreground hover:text-destructive transition-colors"
                        onClick={async () => {
                          try {
                            await removeSponsor(s.id);
                            toast.success("Sponsor removed");
                          } catch {
                            toast.error("Failed to remove sponsor");
                          }
                        }}
                        aria-label={`Remove ${s.name}`}
                        data-ocid={`sponsors.delete_button.${i + 1}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Background Elements */}
            <div className="bg-card border border-border rounded-lg p-4 space-y-4 mb-4">
              <h4 className="font-display text-sm text-foreground">
                BACKGROUND ELEMENTS
              </h4>
              <p className="text-muted-foreground text-xs">
                Upload PNG/SVG images (transparent preferred) to add as floating
                elements in the hero background. Stored locally in your browser.
              </p>

              <input
                ref={bgFileRef}
                type="file"
                accept="image/png,image/svg+xml,image/webp"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  if (file.size > 512 * 1024) {
                    toast.error("File too large (max 512 KB)");
                    return;
                  }
                  const reader = new FileReader();
                  reader.onload = () => {
                    addBgElement({
                      id: `bg_${Date.now()}`,
                      dataUrl: reader.result as string,
                      name: file.name,
                    });
                    toast.success(`Added: ${file.name}`);
                  };
                  reader.readAsDataURL(file);
                  e.target.value = "";
                }}
                data-ocid="admin.upload_button"
              />
              <Button
                variant="outline"
                className="btn-outline-orange w-full text-xs"
                onClick={() => bgFileRef.current?.click()}
                data-ocid="admin.upload_button"
              >
                <ImagePlus className="w-4 h-4 mr-2" />
                UPLOAD IMAGE
              </Button>

              {bgElements.length === 0 ? (
                <p
                  className="text-muted-foreground text-xs text-center py-2"
                  data-ocid="admin.empty_state"
                >
                  No custom elements uploaded yet.
                </p>
              ) : (
                <div className="space-y-2" data-ocid="admin.list">
                  {bgElements.map((el, i) => (
                    <div
                      key={el.id}
                      className="flex items-center gap-3 bg-secondary rounded-lg px-3 py-2"
                      data-ocid={`admin.item.${i + 1}`}
                    >
                      <img
                        src={el.dataUrl}
                        alt={el.name}
                        className="w-8 h-8 object-contain rounded"
                      />
                      <span className="text-xs text-muted-foreground flex-1 truncate">
                        {el.name}
                      </span>
                      <button
                        type="button"
                        className="text-muted-foreground hover:text-destructive transition-colors"
                        onClick={() => {
                          removeBgElement(el.id);
                          toast.success("Element removed");
                        }}
                        aria-label={`Remove ${el.name}`}
                        data-ocid={`admin.delete_button.${i + 1}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Security */}
            <div className="bg-card border border-border rounded-lg p-4 space-y-4 mb-4">
              <div className="flex items-center gap-2">
                <Lock className="w-4 h-4 text-orange-glow" />
                <h4 className="font-display text-sm text-foreground">
                  SECURITY
                </h4>
              </div>
              <p className="text-muted-foreground text-xs">
                Change the admin panel access password. You will need to
                remember the new password to log in next time.
              </p>
              <Button
                className="btn-outline-orange w-full text-xs"
                onClick={() => setShowChangePw(true)}
                data-ocid="admin.open_modal_button"
              >
                <KeyRound className="w-4 h-4 mr-2" />
                CHANGE PASSWORD
              </Button>
            </div>

            {/* Danger Zone */}
            <div className="bg-card border-2 border-destructive/50 rounded-lg p-4 space-y-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-destructive" />
                <h4 className="font-display text-sm text-destructive">
                  DANGER ZONE
                </h4>
              </div>
              <p className="text-muted-foreground text-xs">
                These actions are irreversible. Proceed with caution.
              </p>

              <Button
                variant="outline"
                className="w-full text-xs border-destructive/50 text-destructive hover:bg-destructive/10"
                onClick={handleResetStats}
                data-ocid="admin.delete_button"
              >
                <CheckCircle2 className="w-4 h-4 mr-2" />
                RESET STATS TO &quot;-&quot;
              </Button>

              <Button
                variant="outline"
                className="w-full text-xs border-destructive/50 text-destructive hover:bg-destructive/10"
                onClick={handleClearBgElements}
                data-ocid="admin.delete_button"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                CLEAR BACKGROUND ELEMENTS
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Game Edit Dialog */}
      {editingGame && (
        <GameEditDialog
          game={editingGame}
          open={!!editingGame}
          onClose={() => setEditingGame(null)}
          onSave={handleSaveGame}
          isSaving={
            createGame.isPending || updateGame.isPending || actorFetching
          }
        />
      )}

      {/* Change Password Dialog */}
      <ChangePasswordDialog
        open={showChangePw}
        onClose={() => setShowChangePw(false)}
      />
    </div>
  );
}
