import { gunzip } from "node:zlib";
import { promisify } from "node:util";
import { GetMarketRatesResponse, type MarketRatesDataset } from "@workspace/api-zod";
import { ObjectStorageService } from "./objectStorage";

const unzip = promisify(gunzip);
let loading: Promise<MarketRatesDataset> | undefined;

/** Small, immutable imported snapshot; all 702 records are available for linked client filters. */
export async function marketRates(): Promise<MarketRatesDataset> {
  if (!loading) {
    loading = (async () => {
      const file = await new ObjectStorageService().getObjectEntityFile("/objects/analytics/market-value-lease-rates.json.gz");
      const [compressed] = await file.download();
      const data = GetMarketRatesResponse.parse(JSON.parse((await unzip(compressed)).toString("utf8")));
      if (data.sheet !== "MARKET_VALUE_LEASE_RATES" || !data.rows.length || new Set(data.rows.map(r => r.id)).size !== data.rows.length) {
        throw new Error("Invalid or empty market value / lease rates snapshot");
      }
      return data;
    })().catch(error => { loading = undefined; throw error; });
  }
  return loading;
}
