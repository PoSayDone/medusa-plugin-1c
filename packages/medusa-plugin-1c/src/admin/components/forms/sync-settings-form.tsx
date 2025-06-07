import {
	Heading,
	Label,
	Input,
	Button,
	Drawer,
	Switch,
	Text,
} from "@medusajs/ui";
import { useForm, FormProvider, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as zod from "zod";
import { useState } from "react";

const schema = zod.object({
	interval: zod.number().optional(),
	chunkSize: zod.number().optional(),
	useZip: zod.boolean().optional(),
});

const SyncSettingsForm = ({
	open: openPassed,
	setOpen: setOpenPassed,
}: {
	open?: boolean;
	setOpen?: React.Dispatch<React.SetStateAction<boolean>>;
}) => {
	const [openDefault, setOpenDefault] = useState(false);
	const open = openPassed ?? openDefault;
	const setOpen = setOpenPassed ?? setOpenDefault;

	const form = useForm<zod.infer<typeof schema>>({
		defaultValues: {
			interval: 0,
			chunkSize: 10 * 1024 * 1024,
			useZip: false,
		},
		resolver: zodResolver(schema),
	});

	const handleSubmit = form.handleSubmit(async (data) => {
		console.log(data);
	});

	return (
		<Drawer open={open} onOpenChange={setOpen}>
			<Drawer.Content>
				<FormProvider {...form}>
					<form
						onSubmit={handleSubmit}
						className="flex h-full flex-col overflow-hidden"
					>
						<Drawer.Header>
							<div className="flex items-center justify-end gap-x-2">
								<Heading className="capitalize">
									Update settings
								</Heading>
							</div>
						</Drawer.Header>
						<Drawer.Body>
							<div className="flex flex-1 flex-col items-center overflow-y-auto">
								<div className="mx-auto flex w-full flex-col">
									<div className="flex flex-col gap-4">
										<Controller
											control={form.control}
											name="interval"
											render={({ field }) => {
												return (
													<div className="flex flex-col space-y-2">
														<div className="flex items-center gap-x-1">
															<Label
																size="small"
																weight="plus"
															>
																Interval
															</Label>
														</div>
														<Input {...field} />
													</div>
												);
											}}
										/>
										<Controller
											control={form.control}
											name="chunkSize"
											render={({ field }) => {
												return (
													<div className="flex flex-col space-y-2">
														<div className="flex items-center gap-x-1">
															<Label
																size="small"
																weight="plus"
															>
																Chunk Size
															</Label>
														</div>
														<Input {...field} />
													</div>
												);
											}}
										/>
										<Controller
											control={form.control}
											name="useZip"
											render={({ field }) => {
												return (
													<div className="flex flex-col gap-y-1">
														<div className="flex justify-between">
															<Label
																size="small"
																weight="plus"
															>
																Use zip
															</Label>
															<Switch
																checked={
																	field.value
																}
																onCheckedChange={
																	field.onChange
																}
															/>
														</div>
														<Text
															size="small"
															className="text-ui-fg-subtle"
														>
															Zip files are more
															efficient for large
															files.
														</Text>
													</div>
												);
											}}
										/>
									</div>
								</div>
							</div>
						</Drawer.Body>
						<Drawer.Footer>
							<Drawer.Close asChild>
								<Button size="small" variant="secondary">
									Cancel
								</Button>
							</Drawer.Close>
							<Button type="submit" size="small">
								Save
							</Button>
						</Drawer.Footer>
					</form>
				</FormProvider>
			</Drawer.Content>
		</Drawer>
	);
};

export default SyncSettingsForm;
