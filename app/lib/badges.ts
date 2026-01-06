interface Badge {
  label?: string;
  isPremade?: boolean;
}

export function decoratePromptWithBadges(prompt: string, badgesJson?: string | null): {
  prompt: string;
  hasPremadeBadge: boolean;
  hasCategoryBadge: boolean;
} {
  if (!badgesJson) {
    return { prompt, hasPremadeBadge: false, hasCategoryBadge: false };
  }

  try {
    const badges = JSON.parse(badgesJson);
    if (!Array.isArray(badges) || badges.length === 0) {
      return { prompt, hasPremadeBadge: false, hasCategoryBadge: false };
    }

    const badgeLabels = badges.map((b: Badge) => b.label).filter(Boolean).join(", ");
    const updatedPrompt = badgeLabels ? `[User Context/Selected Features: ${badgeLabels}]\n${prompt}` : prompt;

    return {
      prompt: updatedPrompt,
      hasPremadeBadge: badges.some((b: Badge) => b.isPremade === true),
      hasCategoryBadge: badges.some((b: Badge) => b.isPremade === false),
    };
  } catch (error) {
    console.error("Failed to parse badges", error);
    return { prompt, hasPremadeBadge: false, hasCategoryBadge: false };
  }
}
