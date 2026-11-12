import { z } from "zod";
import { DraftSchema } from "./ai/studio";

// Saved/editor content uses reflowed camel-case beats, unlike the AI response.
export const DraftContentSchema = DraftSchema.extend({
  beats: z.array(z.object({
    start: z.number().finite().nonnegative(),
    duration: z.number().finite().positive().max(180),
    vo: z.string().max(10000),
    onScreen: z.string().max(10000),
    visual: z.string().max(10000),
    shot: z.number().int().nonnegative(),
  }).strict()).min(1).max(200),
  selected_hook: z.number().int().nonnegative().optional(),
}).strict();
