"use client";

import { applyTheme, type Theme } from "@cloudscape-design/components/theming";

/**
 * Cloudscape's stock primary button is blue. The AWS console themes it with the
 * Amazon orange used for the main call to action ("Create hosted zone", "Create
 * record", "Save changes"), so the default build looks visibly un-AWS.
 *
 * Applied through Cloudscape's supported `applyTheme` token API rather than by
 * overriding CSS: the underlying custom properties carry generated hashes in their
 * names, so hand-written CSS overrides would break on any library upgrade.
 *
 * Values are the console's button palette: #ff9900 at rest, #ec7211 on hover and
 * #dd6b10 while pressed, with near-black label text for contrast on orange.
 */
const AWS_ORANGE = "#ff9900";
const AWS_ORANGE_HOVER = "#ec7211";
const AWS_ORANGE_ACTIVE = "#dd6b10";
const AWS_BUTTON_INK = "#0f141a";

const awsConsoleTheme: Theme = {
  tokens: {
    colorBackgroundButtonPrimaryDefault: AWS_ORANGE,
    colorBackgroundButtonPrimaryHover: AWS_ORANGE_HOVER,
    colorBackgroundButtonPrimaryActive: AWS_ORANGE_ACTIVE,
    colorBorderButtonPrimaryDefault: AWS_ORANGE,
    colorBorderButtonPrimaryHover: AWS_ORANGE_HOVER,
    colorBorderButtonPrimaryActive: AWS_ORANGE_ACTIVE,
    colorTextButtonPrimaryDefault: AWS_BUTTON_INK,
    colorTextButtonPrimaryHover: AWS_BUTTON_INK,
    colorTextButtonPrimaryActive: AWS_BUTTON_INK,
  },
};

let applied = false;

/** Idempotent: React may mount the provider twice in development. */
export function applyAwsConsoleTheme() {
  if (applied) return;
  applied = true;
  applyTheme({ theme: awsConsoleTheme });
}
