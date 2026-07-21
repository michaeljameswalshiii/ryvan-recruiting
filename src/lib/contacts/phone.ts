/**
 * Contact phone helpers for multi-phone contact structure.
 * Priority: preferredPhone → phones[] (preferred/first) → legacy phone
 */

export type ContactPhoneLike = {
  id?: string;
  type?: string;
  number?: string;
  isPreferred?: boolean;
};

export type ContactPhoneFields = {
  phone?: string | null;
  preferredPhone?: string | null;
  preferredPhoneType?: string | null;
  phones?: ContactPhoneLike[] | null;
};

export function getDisplayPhone(contact?: ContactPhoneFields | null): string {
  if (!contact) return '';

  const preferred = (contact.preferredPhone || '').trim();
  if (preferred) return preferred;

  const phones = contact.phones;
  if (Array.isArray(phones) && phones.length > 0) {
    const preferredEntry = phones.find((p) => p?.isPreferred && (p.number || '').trim());
    if (preferredEntry?.number?.trim()) return preferredEntry.number.trim();
    const first = phones.find((p) => (p?.number || '').trim());
    if (first?.number?.trim()) return first.number.trim();
  }

  return (contact.phone || '').trim();
}

export function getDisplayPhoneType(contact?: ContactPhoneFields | null): string {
  if (!contact) return '';

  const preferredType = (contact.preferredPhoneType || '').trim();
  if (preferredType) return preferredType;

  const phones = contact.phones;
  if (Array.isArray(phones) && phones.length > 0) {
    const preferredEntry = phones.find((p) => p?.isPreferred && (p.number || '').trim());
    if (preferredEntry?.type) return preferredEntry.type;
    const first = phones.find((p) => (p?.number || '').trim());
    if (first?.type) return first.type;
  }

  return '';
}

export type NormalizedContactPhone = {
  id: string;
  type: string;
  number: string;
  isPreferred: boolean;
};

/** Build a phones[] array from work / mobile fields (UI convenience). */
export function phonesFromWorkAndMobile(input: {
  workPhone?: string | null;
  mobilePhone?: string | null;
  cellPhone?: string | null;
  /** Legacy single phone when work/mobile not split */
  phone?: string | null;
  preferred?: 'work' | 'mobile' | null;
}): NormalizedContactPhone[] {
  const work = (input.workPhone || '').trim();
  const mobile = (input.mobilePhone || input.cellPhone || '').trim();
  const legacy = (input.phone || '').trim();
  const phones: NormalizedContactPhone[] = [];

  if (work) {
    phones.push({
      id: crypto.randomUUID(),
      type: 'work',
      number: work,
      isPreferred: input.preferred === 'work' || (!input.preferred && !mobile),
    });
  }
  if (mobile) {
    phones.push({
      id: crypto.randomUUID(),
      type: 'mobile',
      number: mobile,
      isPreferred: input.preferred === 'mobile' || (!work && !input.preferred),
    });
  }
  if (phones.length === 0 && legacy) {
    // Support "work / mobile" style strings from AI or paste
    const parts = legacy.split(/\s*[/|;]\s*/).map((p) => p.trim()).filter(Boolean);
    if (parts.length >= 2) {
      phones.push({
        id: crypto.randomUUID(),
        type: 'work',
        number: parts[0],
        isPreferred: true,
      });
      phones.push({
        id: crypto.randomUUID(),
        type: 'mobile',
        number: parts[1],
        isPreferred: false,
      });
    } else {
      phones.push({
        id: crypto.randomUUID(),
        type: 'work',
        number: legacy,
        isPreferred: true,
      });
    }
  }

  if (phones.length > 0 && !phones.some((p) => p.isPreferred)) {
    phones[0].isPreferred = true;
  }
  return phones;
}

export function getPhoneByType(
  contact?: ContactPhoneFields | null,
  type: string = 'work'
): string {
  if (!contact) return '';
  const t = type.toLowerCase();
  const phones = contact.phones;
  if (Array.isArray(phones)) {
    const match = phones.find(
      (p) => (p?.type || '').toLowerCase() === t && (p.number || '').trim()
    );
    if (match?.number?.trim()) return match.number.trim();
  }
  // Fallbacks for legacy single-phone contacts
  if (t === 'work' || t === 'office') {
    const preferredType = (contact.preferredPhoneType || '').toLowerCase();
    if (preferredType === 'work' || preferredType === 'office') {
      return (contact.preferredPhone || contact.phone || '').trim();
    }
    if (!preferredType && (!Array.isArray(phones) || phones.length === 0)) {
      return (contact.phone || contact.preferredPhone || '').trim();
    }
  }
  if (t === 'mobile' || t === 'cell') {
    const preferredType = (contact.preferredPhoneType || '').toLowerCase();
    if (preferredType === 'mobile' || preferredType === 'cell') {
      return (contact.preferredPhone || '').trim();
    }
  }
  return '';
}

export function normalizeContactPhones(input: {
  phone?: string | null;
  phones?: ContactPhoneLike[] | null;
  workPhone?: string | null;
  mobilePhone?: string | null;
  cellPhone?: string | null;
}): {
  phones?: NormalizedContactPhone[];
  phone?: string;
  preferredPhone?: string;
  preferredPhoneType?: string;
} {
  let phones: NormalizedContactPhone[] | undefined = Array.isArray(input.phones)
    ? input.phones
        .filter((p) => p && typeof p.number === 'string' && p.number.trim() !== '')
        .map((p) => ({
          id: typeof p.id === 'string' && p.id ? p.id : crypto.randomUUID(),
          type: typeof p.type === 'string' && p.type ? p.type : 'work',
          number: p.number!.trim(),
          isPreferred: !!p.isPreferred,
        }))
    : undefined;

  if ((!phones || phones.length === 0) && (input.workPhone || input.mobilePhone || input.cellPhone)) {
    phones = phonesFromWorkAndMobile({
      workPhone: input.workPhone,
      mobilePhone: input.mobilePhone,
      cellPhone: input.cellPhone,
      phone: input.phone,
    });
  }

  if ((!phones || phones.length === 0) && input.phone && input.phone.trim()) {
    phones = phonesFromWorkAndMobile({ phone: input.phone });
  }

  if (!phones || phones.length === 0) {
    return {};
  }

  if (!phones.some((p) => p.isPreferred)) {
    phones = phones.map((p, i) => ({ ...p, isPreferred: i === 0 }));
  }

  const preferred = phones.find((p) => p.isPreferred) || phones[0];
  return {
    phones,
    phone: preferred.number,
    preferredPhone: preferred.number,
    preferredPhoneType: preferred.type || 'work',
  };
}
