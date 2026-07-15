/**
 * `plan` domain (L4) — registers the spec-coding experimental flag.
 *
 * Enables project-local specification and delivery documents for Plan mode.
 */

import { type FlagDefinitionInput, registerFlagDefinition } from '#/app/flag/flagRegistry';

export const SPEC_CODING_FLAG_ID = 'spec-coding';

export const specCodingFlag: FlagDefinitionInput = {
  id: SPEC_CODING_FLAG_ID,
  title: 'Spec coding',
  description:
    'Store Plan mode requirements, design, and task checklists in workspace-local specification documents.',
  env: 'KIMI_CODE_EXPERIMENTAL_SPEC_CODING',
  default: false,
  surface: 'core',
};

registerFlagDefinition(specCodingFlag);
