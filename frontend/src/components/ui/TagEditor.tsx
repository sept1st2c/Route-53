"use client";

import CloudscapeTagEditor, { type TagEditorProps } from "@cloudscape-design/components/tag-editor";

export type Tag = TagEditorProps.Tag;

/**
 * Route 53 tag limits. Key/Value maxima are enforced by Cloudscape itself (128 / 256), which
 * happens to match the Route 53 API `Tag` type exactly, so we only supply the copy and the
 * per-resource cap the console surfaces ("You can add up to 50 more tags.").
 */
export const MAX_TAGS = 50;

const I18N: TagEditorProps.I18nStrings = {
  keyHeader: "Key",
  valueHeader: "Value",
  optional: "optional",
  keyPlaceholder: "Enter key",
  valuePlaceholder: "Enter value",
  addButton: "Add tag",
  removeButton: "Remove tag",
  removeButtonAriaLabel: (tag) => `Remove tag ${tag.key}`,
  undoButton: "Undo",
  undoPrompt: "This tag will be removed upon saving changes",
  loading: "Loading tags that are associated with this resource",
  keySuggestion: "Custom tag key",
  valueSuggestion: "Custom tag value",
  emptyTags: "No tags associated with the resource.",
  tooManyKeysSuggestion: "You have more keys than can be displayed",
  tooManyValuesSuggestion: "You have more values than can be displayed",
  keysSuggestionLoading: "Loading tag keys",
  keysSuggestionError: "Tag keys could not be retrieved",
  valuesSuggestionLoading: "Loading tag values",
  valuesSuggestionError: "Tag values could not be retrieved",
  emptyKeyError: "You must specify a tag key",
  maxKeyCharLengthError: "The maximum number of characters you can use in a tag key is 128.",
  maxValueCharLengthError: "The maximum number of characters you can use in a tag value is 256.",
  duplicateKeyError: "You must specify a unique tag key.",
  invalidKeyError:
    "Invalid characters detected. You can use letters, numbers, spaces, and the following characters: + - = . _ : / @",
  invalidValueError:
    "Invalid characters detected. You can use letters, numbers, spaces, and the following characters: + - = . _ : / @",
  awsPrefixError: "Cannot start with aws:",
  errorIconAriaLabel: "Error",
  clearAriaLabel: "Clear",
  itemRemovedAriaLive: "Tag removed",
  enteredKeyLabel: (key) => `Use "${key}"`,
  enteredValueLabel: (value) => `Use "${value}"`,
  tagLimit: (available) =>
    available === 1 ? "You can add up to 1 more tag." : `You can add up to ${available} more tags.`,
  tagLimitReached: (limit) =>
    limit === 1 ? "You have reached the limit of 1 tag." : `You have reached the limit of ${limit} tags.`,
  tagLimitExceeded: (limit) =>
    limit === 1 ? "You have exceeded the limit of 1 tag." : `You have exceeded the limit of ${limit} tags.`,
};

/** Controlled wrapper so the owning form can block submission while a tag row is invalid. */
export function TagEditor({
  tags,
  onChange,
  loading,
}: {
  tags: readonly Tag[];
  onChange: (tags: readonly Tag[], valid: boolean) => void;
  loading?: boolean;
}) {
  return (
    <CloudscapeTagEditor
      tags={tags}
      loading={loading}
      tagLimit={MAX_TAGS}
      i18nStrings={I18N}
      onChange={({ detail }) => onChange(detail.tags, detail.valid)}
    />
  );
}
