import { gunzip } from "node:zlib";
import { promisify } from "node:util";
import { GetJurisdictionRiskResponse, type JurisdictionRiskDataset } from "@workspace/api-zod";
import { ObjectStorageService } from "./objectStorage";

const unzip = promisify(gunzip);
let loading: Promise<JurisdictionRiskDataset> | undefined;
export function jurisdictionRisk(): Promise<JurisdictionRiskDataset> {
  if (!loading) {
    loading = (async () => {
      const file = await new ObjectStorageService().getObjectEntityFile("/objects/analytics/jurisdiction-risk.json.gz");
      const [compressed] = await file.download();
      const data = GetJurisdictionRiskResponse.parse(JSON.parse((await unzip(compressed)).toString("utf8")));
      if (data.sheet !== "JURISDICTION_RISK_ANALYSIS" || !data.rows.length ||
          new Set(data.rows.map(r => r.id)).size !== data.rows.length) {
        throw new Error("Invalid or empty jurisdiction risk snapshot");
      }
      const geography = JSON.parse(data.mapGeography);
      if (geography.type !== "FeatureCollection" || !Array.isArray(geography.features) || !geography.features.length) {
        throw new Error("Invalid jurisdiction map geography");
      }
      return data;
    })().catch(error => { loading = undefined; throw error; });
  }
  return loading;
}
