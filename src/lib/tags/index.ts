export * from "./types";
export {
  BASE_TAXONOMY,
  mergeTaxonomy,
  getTaxonomyEntry,
  labelToId,
  expandSearchToken,
} from "./taxonomy";
export {
  classifyText,
  tagsFromRecord,
  mergeManualAndGenerated,
} from "./engine";
export { matchControlledTags } from "./match";
export { recordMatchesQuery, splitAndClauses } from "./search";
