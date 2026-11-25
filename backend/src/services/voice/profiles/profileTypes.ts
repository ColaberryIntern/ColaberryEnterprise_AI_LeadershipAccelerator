/**
 * Typed attributes for the two profile tables (VS3.1). The Voice Studio models are generated from
 * db/voiceStudioTableSpecs.ts and are untyped (ModelStatic<Model>); the VS1.4 verifier asked that any
 * business logic reading them declare its attributes first. These interfaces mirror the spec columns
 * one-to-one, and profileTypes.test.ts fails if a column is added to or removed from the spec without
 * updating them.
 */

export type ProfileDirection = 'outbound' | 'inbound' | 'both';
export type ProfileStatus = 'draft' | 'active' | 'retired';
export type VersionStatus = 'draft' | 'approved' | 'published' | 'retired';

export interface VoiceAgentProfileAttrs {
  id: string;
  tenant_id: string;
  brand_slug: string;
  /** Stable key of the existing agent this profile is a phone channel for (see voiceToolPolicy). */
  agent_key: string;
  name: string;
  direction: ProfileDirection;
  default_number_id: string | null;
  active_version_id: string | null;
  status: ProfileStatus;
  created_at: Date;
  updated_at: Date;
}

export interface VoiceAgentVersionAttrs {
  id: string;
  tenant_id: string;
  profile_id: string;
  version: number;
  content_hash: string;
  prompt: string;
  first_message: string | null;
  disclosure: string;
  kb_refs: string[];
  tool_permissions: string[];
  engine: string;
  engine_config: Record<string, unknown>;
  voice_id: string | null;
  language: string;
  safety_policy: Record<string, unknown>;
  max_call_seconds: number;
  author: string;
  approved_by: string | null;
  approved_at: Date | null;
  status: VersionStatus;
  created_at: Date;
}

export const PROFILE_ATTR_KEYS: ReadonlyArray<keyof VoiceAgentProfileAttrs> = [
  'id', 'tenant_id', 'brand_slug', 'agent_key', 'name', 'direction', 'default_number_id', 'active_version_id', 'status', 'created_at', 'updated_at',
];

export const VERSION_ATTR_KEYS: ReadonlyArray<keyof VoiceAgentVersionAttrs> = [
  'id', 'tenant_id', 'profile_id', 'version', 'content_hash', 'prompt', 'first_message', 'disclosure', 'kb_refs', 'tool_permissions',
  'engine', 'engine_config', 'voice_id', 'language', 'safety_policy', 'max_call_seconds', 'author', 'approved_by', 'approved_at', 'status', 'created_at',
];
