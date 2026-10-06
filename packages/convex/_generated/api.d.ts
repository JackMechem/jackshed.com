/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as ResendOTP from "../ResendOTP.js";
import type * as account from "../account.js";
import type * as auth from "../auth.js";
import type * as chordCharts from "../chordCharts.js";
import type * as communityChordCharts from "../communityChordCharts.js";
import type * as communityTunes from "../communityTunes.js";
import type * as follows from "../follows.js";
import type * as http from "../http.js";
import type * as lib_chordCharts from "../lib/chordCharts.js";
import type * as lib_resend from "../lib/resend.js";
import type * as practiceSessions from "../practiceSessions.js";
import type * as profiles from "../profiles.js";
import type * as syncedSettings from "../syncedSettings.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  ResendOTP: typeof ResendOTP;
  account: typeof account;
  auth: typeof auth;
  chordCharts: typeof chordCharts;
  communityChordCharts: typeof communityChordCharts;
  communityTunes: typeof communityTunes;
  follows: typeof follows;
  http: typeof http;
  "lib/chordCharts": typeof lib_chordCharts;
  "lib/resend": typeof lib_resend;
  practiceSessions: typeof practiceSessions;
  profiles: typeof profiles;
  syncedSettings: typeof syncedSettings;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
