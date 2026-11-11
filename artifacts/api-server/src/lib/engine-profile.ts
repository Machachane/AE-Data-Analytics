import { gunzip } from "node:zlib";
import { promisify } from "node:util";
import { GetEngineProfileResponse, type EngineProfileDataset } from "@workspace/api-zod";
import { ObjectStorageService } from "./objectStorage";

const unzip = promisify(gunzip);
let loading: Promise<EngineProfileDataset> | undefined;

export function engineProfile(): Promise<EngineProfileDataset> {
  if (!loading) {
    loading = (async () => {
      const file = await new ObjectStorageService().getObjectEntityFile("/objects/analytics/engine-profile.json.gz");
      const [compressed] = await file.download();
      const data = GetEngineProfileResponse.parse(JSON.parse((await unzip(compressed)).toString("utf8")));
      if (data.sheet !== "ENGINE_PROFILE" || !data.rows.length ||
          new Set(data.rows.map(r => r.id)).size !== data.rows.length) {
        throw new Error("Invalid or empty engine profile snapshot");
      }
      return data;
    })().catch(error => { loading = undefined; throw error; });
  }
  return loading;
}
