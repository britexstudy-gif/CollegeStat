"use client";
/* The avatar builder on the profile: the student's avatar with a pencil badge; clicking it
 * opens a dialog to pick a colour and a sticker (or go back to their Google/GitHub photo). */
import { useState } from "react";
import { Pencil } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Btn } from "./dash-ui";
import { useI18n } from "./i18n";
import { AVATAR_BGS, AVATAR_STICKERS, UserAvatar, avatarOf, avatarSrcOf, type AvatarChoice } from "./user-avatar";
import { useCollege } from "./provider";

export function AvatarBuilder({ size = 96, save }: { size?: number; save: (avatar: AvatarChoice) => Promise<boolean> }) {
  const s = useCollege();
  const { t } = useI18n();
  const current = avatarOf(s.profile, s.user);
  const photo = avatarSrcOf(s.profile, s.user);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<AvatarChoice>(current.choice);
  const [busy, setBusy] = useState(false);
  const start = () => {
    setDraft({ ...current.choice, photo: !!current.src });
    setOpen(true);
  };
  const submit = async () => {
    setBusy(true);
    const ok = await save(draft);
    setBusy(false);
    if (ok) {
      toast.success(t("av.saved"));
      setOpen(false);
    }
  };
  return (
    <>
      <button type="button" className="pfs-avatar-btn" onClick={start} aria-label={t("av.edit")}>
        <UserAvatar {...current} size={size} className="pfs-avatar" />
        <span className="pfs-avatar-pen" aria-hidden="true">
          <Pencil />
        </span>
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>{t("av.title")}</DialogTitle>
            <DialogDescription>{t("av.sub")}</DialogDescription>
          </DialogHeader>
          <div className="uab">
            <div className="uab-preview">
              <UserAvatar key={draft.bg + draft.s + draft.photo} src={draft.photo ? photo : null} choice={draft} size={104} />
            </div>
            <div>
              <h3>{t("av.colour")}</h3>
              <div className="uab-bgs">
                {AVATAR_BGS.map((b) => (
                  <button key={b.id} type="button" aria-label={b.id} aria-pressed={draft.bg === b.id} style={{ background: b.css }} onClick={() => setDraft({ ...draft, bg: b.id, photo: false })} />
                ))}
              </div>
            </div>
            <div>
              <h3>{t("av.sticker")}</h3>
              <div className="uab-stickers">
                {AVATAR_STICKERS.map((x) => (
                  <button key={x} type="button" aria-pressed={draft.s === x} onClick={() => setDraft({ ...draft, s: x, photo: false })}>
                    {x}
                  </button>
                ))}
              </div>
            </div>
            {photo && (
              <label className="uab-photo">
                <input type="checkbox" checked={!!draft.photo} onChange={(e) => setDraft({ ...draft, photo: e.target.checked })} />
                {t("av.photo")}
              </label>
            )}
            <div className="uab-actions">
              <Btn onClick={() => setOpen(false)}>{t("av.cancel")}</Btn>
              <Btn variant="primary" disabled={busy} onClick={() => void submit()}>
                {t("av.save")}
              </Btn>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
