export type ContactFields = { name: string; email: string; message: string };

// Same rules as the design: a name, something@something.tld, and a few words of message
export const firstInvalidField = (
  fields: ContactFields,
): keyof ContactFields | null => {
  if (!fields.name.trim()) return "name";
  if (!/^\S+@\S+\.\S+$/.test(fields.email.trim())) return "email";
  if (fields.message.trim().length < 5) return "message";
  return null;
};

// Fills {key} placeholders in copy such as "Thanks, {name}!"
export const fillTemplate = (
  template: string,
  values: Record<string, string>,
): string =>
  template.replace(/\{(\w+)\}/g, (match, key: string) => values[key] ?? match);
