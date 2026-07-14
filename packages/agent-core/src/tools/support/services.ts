import type { UrlFetcher, WebSearchProvider } from '../builtin';
import type { ImageGenerationProvider } from '../builtin/image/generate-image';

export interface ToolServices {
  readonly urlFetcher?: UrlFetcher;
  readonly webSearcher?: WebSearchProvider;
  readonly imageGenerator?: ImageGenerationProvider;
}
