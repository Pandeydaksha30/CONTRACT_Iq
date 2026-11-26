/** Progress is only useful while a run is going: rows older than a day are deleted every hour. */
import { anyApi, cronJobs } from "convex/server";

const crons = cronJobs();
crons.interval("prune old progress", { hours: 1 }, anyApi.progress.prune, {});
export default crons;
