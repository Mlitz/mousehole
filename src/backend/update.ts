import { notifyWebSocketClients } from "#index.tsx";
import { getNowZdt } from "#shared/time.ts";

import type {
  BackgroundTask,
  HostInfo,
  MamResponse,
  ManualUpdateReason,
  State,
  UpdateReason,
} from "./types.ts";

import { config } from "./config.ts";
import { NoCookieError } from "./error.ts";
import { getHostInfo } from "./external-api/host-info.ts";
import { updateMamIp } from "./external-api/mam.ts";
import { stateFile } from "./store.ts";

let currentBackgroundTask: BackgroundTask | undefined;

type UpdateOptions = {
  force: boolean;
};

export function getUpdateReason(
  state: State | undefined,
  hostInfo: HostInfo
): UpdateReason | undefined {
  const lastMamResponse = state?.lastMam;

  if (!lastMamResponse) {
    return "no-last-response";
  } else if (lastMamResponse.response.httpStatus !== 200) {
    return "last-response-error";
  } else if (hostInfo.ip !== lastMamResponse.response.body.ip) {
    return "ip-changed";
  } else if (hostInfo.asn !== lastMamResponse.response.body.ASN) {
    return "asn-changed";
  } else if (responseIsStale(lastMamResponse)) {
    return "response-stale";
  }
}

/**
 * Perform the core IP update logic
 */
async function update(options?: UpdateOptions): Promise<State> {
  const force = options?.force ?? false;

  const state = await stateFile.readIfExists();
  const hostInfo = await getHostInfo();

  if (!state?.currentCookie) {
    throw new NoCookieError();
  }

  const reason: ManualUpdateReason | undefined = force
    ? "forced"
    : getUpdateReason(state, hostInfo);

  if (!reason) {
    console.log("No update needed, current state is ok");
    const newState: State = {
      currentCookie: state.currentCookie,
      lastMam: state.lastMam,
      lastUpdate: {
        at: getNowZdt(),
        mamUpdated: false,
        mamUpdateReason: reason,
      },
    };
    return newState;
  }

  console.log(`Updating MAM because: ${reason}`);

  const mamResponse = await updateMamIp(state.currentCookie);

  const success = mamResponse.response.httpStatus === 200;

  if (success) {
    console.log("IP address updated with MAM");
  } else {
    console.error(
      `Failed to update IP address with MAM: ${mamResponse.response.httpStatus} - ${mamResponse.response.body.msg}`
    );
  }

  if (!mamResponse.response.cookie) {
    console.warn("No cookie returned in MAM response, using previous value");
  }
  const nextCookieValue = mamResponse.response.cookie ?? state.currentCookie;

  const newState: State = {
    currentCookie: nextCookieValue,
    lastMam: mamResponse,
    lastUpdate: {
      at: getNowZdt(),
      mamUpdated: true,
      mamUpdateReason: reason,
    },
  };
  return newState;
}

function responseIsStale(response: MamResponse): boolean {
  // Check if the last response is older than the force update interval.
  const performedAt = response.request.at;
  const staleAt = performedAt.add({
    seconds: config.staleResponseSeconds,
  });
  return staleAt.epochNanoseconds <= getNowZdt().epochNanoseconds;
}

/**
 * Clears any existing scheduled task and sets a new one.
 */
function reschedule() {
  console.log("[DEBUG] reschedule() called");

  try {
    // Cancel the previously scheduled task, if it exists.
    console.log("[DEBUG] Checking for existing task to clear");
    if (currentBackgroundTask?.nextUpdateTimeoutId) {
      console.log("[DEBUG] Clearing existing timeout");
      clearTimeout(currentBackgroundTask.nextUpdateTimeoutId);
    }

    // Schedule the next run.
    console.log("[DEBUG] About to schedule setTimeout");
    const timeoutId = setTimeout(
      () => {
        console.log("[DEBUG] setTimeout callback fired, calling updateAndReschedule");
        updateAndReschedule(undefined, true);
      },
      config.checkIntervalSeconds * 1000
    );
    console.log(`[DEBUG] setTimeout scheduled with ID: ${timeoutId}`);

    // this won't be exactly right because of the time between last statement
    // (setTimeout) and this line but it will be close enough for our purposes.
    console.log("[DEBUG] About to calculate nextUpdateAt");
    const nextUpdateAt = getNowZdt().add({
      seconds: config.checkIntervalSeconds,
    });
    console.log(`[DEBUG] nextUpdateAt calculated: ${nextUpdateAt}`);

    console.log("[DEBUG] About to set currentBackgroundTask");
    currentBackgroundTask = {
      nextUpdateTimeoutId: timeoutId,
      nextUpdateAt,
    };
    console.log("[DEBUG] currentBackgroundTask set successfully");

    console.log(`Next automatic update scheduled for: ${nextUpdateAt}`);
    console.log("[DEBUG] About to return from reschedule()");
  } catch (error) {
    console.error("[DEBUG] ERROR in reschedule():", error);
    throw error;
  }
}

type UpdateAndRescheduleReturn<JustLogError extends boolean = false> =
  JustLogError extends true ? void : State;

/**
 * Manually update the IP and resets the automatic update schedule.
 * This is the function to call when a user initiates the update.
 * @returns The result of the MAM update.
 */
export async function updateAndReschedule<JustLogError extends boolean = false>(
  options?: UpdateOptions,
  justLogError: JustLogError = false as JustLogError
): Promise<UpdateAndRescheduleReturn<JustLogError>> {
  console.log("[DEBUG] updateAndReschedule() called");
  try {
    console.log("[DEBUG] Calling update()");
    const newState = await update(options);
    console.log("[DEBUG] update() completed");

    // write, but also return to callers (such as API handlers)
    console.log("[DEBUG] Writing state file");
    await stateFile.write(newState);
    console.log("[DEBUG] State file written");

    console.log("[DEBUG] Notifying WebSocket clients");
    notifyWebSocketClients();
    console.log("[DEBUG] WebSocket clients notified");

    console.log("[DEBUG] About to return from updateAndReschedule()");
    return newState as UpdateAndRescheduleReturn<JustLogError>;
  } catch (error) {
    console.log("[DEBUG] Error caught in updateAndReschedule():", error);
    if (justLogError) {
      console.error(error);
      return undefined as UpdateAndRescheduleReturn<JustLogError>;
    } else {
      throw error;
    }
  } finally {
    console.log("[DEBUG] In finally block, about to call reschedule()");
    reschedule();
    console.log("[DEBUG] reschedule() completed, exiting finally block");
  }
}

/**
 * Starts the background task scheduler.
 * Call this once when server starts.
 */
export function startBackgroundUpdateTask() {
  console.log("Starting background update task...");
  console.log("[DEBUG] About to call initial updateAndReschedule()");
  // We run the update once immediately, then schedule the next one.
  updateAndReschedule(undefined, true);
  console.log("[DEBUG] Initial updateAndReschedule() call initiated (async)");
}

export function getNextUpdateAt() {
  return currentBackgroundTask?.nextUpdateAt;
}
