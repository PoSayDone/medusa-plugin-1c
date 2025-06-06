import { defineMiddlewares } from "@medusajs/framework/http";
import bodyParser from "body-parser";

export default defineMiddlewares({
	routes: [
		{
			method: ["POST"],
			matcher: "/bitrix/admin/1c_exchange.php",
			middlewares: [
				bodyParser.raw({
					type: () => true, // catch all content types
					limit: "50mb",
				}),
			],
		},
	],
});
