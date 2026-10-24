// Pop-up messages

import { $ } from "./dom";
import { answerDialog, set } from "./state";

export const dialog = $<HTMLDialogElement>("dialog");


/** Shows a message; with `ask`, also a Cancel button. Resolves true for OK.
 *  The answer comes from the button clicks themselves (and Escape), not the
 *  dialog's "close" event, which some browsers deliver late. */
export function message(title: string, text: string, ask = false): Promise<boolean> {
  answerDialog?.(false); // a message still open counts as cancelled
  $("dialog-title").textContent = title;
  $("dialog-text").textContent = text;
  $("dialog-cancel").hidden = !ask;
  if (!dialog.open) dialog.showModal();
  $("dialog-ok").focus();
  return new Promise((resolve) => (set.answerDialog(resolve)));
}

export function closeDialog(ok: boolean) {
  const answer = answerDialog;
  set.answerDialog(null);
  dialog.close();
  answer?.(ok);
}
