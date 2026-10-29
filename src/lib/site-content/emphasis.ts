export type Segment = { text: string; em: boolean };

// Splits copy on *asterisk* pairs so a page can set the marked words in <em>
export const splitEmphasis = (text: string): Segment[] =>
  text
    .split(/\*([^*]+)\*/)
    .map((part, i) => ({ text: part, em: i % 2 === 1 }))
    .filter((segment) => segment.text !== "");
