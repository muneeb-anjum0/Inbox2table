export const normalizeSemesterLabel = (value?: string | null): string => {
  if (!value) return 'Unknown';

  const cleaned = value.replace(/\s+/g, ' ').trim();
  if (!cleaned) return 'Unknown';

  const upper = cleaned.toUpperCase();

  if (upper.includes('BS') && upper.includes('PSY')) {
    const match = cleaned.match(/BS\s*(?:\(|\s)?(?:PSY|PSYCHOLOGY)(?:\))?\s*(Open|OPEN|\d+[A-Z]?)/i);
    if (match) {
      const suffix = match[1].toLowerCase() === 'open' ? 'Open' : match[1];
      return `BS Psychology ${suffix}`;
    }
  }

  const slashParts = cleaned.split('/').map(part => part.trim()).filter(Boolean);
  if (slashParts.length >= 2) {
    const primary = slashParts[0];

    const looksLikeSectionLabel = /^[A-Za-z&().\s-]*\d+(?:\s+[A-Z])?$/;

    if (looksLikeSectionLabel.test(primary)) {
      return primary;
    }
  }

  return cleaned;
};

export const normalizeSemesterKey = (value?: string | null): string => {
  return normalizeSemesterLabel(value).toUpperCase().replace(/[^A-Z0-9]+/g, '');
};