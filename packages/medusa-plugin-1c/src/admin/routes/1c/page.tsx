import { defineRouteConfig } from "@medusajs/admin-sdk";
import { Container } from "../../components/container";
import OnecIcon from "../../components/icons/onec";
import { Header } from "../../components/header";
import { PencilSquare } from "@medusajs/icons";
import { SectionRow } from "../../components/section-row";
import SyncSettingsForm from "../../components/forms/sync-settings-form";
import { useState } from "react";

const OnecAdminPage = () => {
	const [openSyncSettings, setOpenSyncSettings] = useState(false);

	return (
		<div className="flex flex-col gap-y-3">
			<SyncSettingsForm
				open={openSyncSettings}
				setOpen={setOpenSyncSettings}
			/>
			<Container>
				<Header
					title={"1C Sync settings"}
					actions={[
						{
							type: "action-menu",
							props: {
								groups: [
									{
										actions: [
											{
												label: "Edit",
												onClick: () =>
													setOpenSyncSettings(true),
												icon: <PencilSquare />,
											},
										],
									},
								],
							},
						},
					]}
				/>
				<SectionRow title="Step interval in seconds (0 - load in a single step)" />
				<SectionRow title="Size of each file chunk to load at once (in bytes)" />
				<SectionRow title="Use zip compression if available" />
			</Container>
			<Container>
				<Header
					title={"Attributes ID's"}
					subtitle={
						"Set ID's for respective attributes from your 1C system for proper import"
					}
					actions={[
						{
							type: "action-menu",
							props: {
								groups: [
									{
										actions: [
											{
												label: "Edit",
												onClick: () => {},
												icon: <PencilSquare />,
											},
										],
									},
								],
							},
						},
					]}
				/>
				<SectionRow title="Height" />
				<SectionRow title="Width" />
				<SectionRow title="Length" />
				<SectionRow title="Weight" />
				<SectionRow title="MID code" />
				<SectionRow title="HS code" />
				<SectionRow title="Country of origin" />
			</Container>
		</div>
	);
};

export const config = defineRouteConfig({
	label: "1C",
	icon: OnecIcon,
});

export default OnecAdminPage;
