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

export function normalizeContactPhones(input: {
  phone?: string | null;
  phones?: ContactPhoneLike[] | null;
}): {
  phones?: ContactPhoneLike[];
  phone?: string;
  preferredPhone?: string;
  preferredPhoneType?: string;
} {
  let phones = Array.isArray(input.phones)
    ? input.phones
        .filter((p) => p && typeof p.number === 'string' && p.number.trim() !== '')
        .map((p) => ({
          id: typeof p.id === 'string' && p.id ? p.id : crypto.randomUUID(),
          type: typeof p.type === 'string' && p.type ? p.type : 'work',
          number: p.number!.trim(),
          isPreferred: !!p.isPreferred,
        }))
    : undefined;

  if ((!phones || phones.length === 0) && input.phone && input.phone.trim()) {
    phones = [
      {
        id: crypto.randomUUID(),
        type: 'work',
        number: input.phone.trim(),
        isPreferred: true,
      },
    ];
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
