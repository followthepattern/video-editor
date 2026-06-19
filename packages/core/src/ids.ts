import { nanoid } from "nanoid";

export const newId = (prefix: string): string => `${prefix}_${nanoid(10)}`;
