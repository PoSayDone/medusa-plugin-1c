import { MedusaService } from "@medusajs/utils";
import { OneCSettings } from "./models/one-c-settings";

class OneCSettingsService extends MedusaService({
	OneCSettings,
}) {}

export default OneCSettingsService;
