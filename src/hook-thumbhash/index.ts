import type { AssetsService, ItemsService } from "@directus/api/dist/services";
import { defineHook } from "@directus/extensions-sdk";
import type { File } from "@directus/types";
import { rgbaToThumbHash } from "thumbhash";
const sharp = require("sharp");

export default defineHook(({ action }, ctx) => {
  const services = ctx.services as {
    ItemsService: typeof ItemsService;
    AssetsService: typeof AssetsService;
  };
  const logger = ctx.logger.child({ extension: "Thumbhash" });

  action("files.upload", async ({ key }, { schema, database, accountability }) => {
    if (!schema) {
      logger.warn("Schema not found");
      return;
    }

    if (!schema.collections.directus_files?.fields?.thumbhash) {
      logger.warn("Missing thumbhash field on directus_files");
      logger.warn("Migration needs to be run to add thumbhash field to images");
      return;
    }
    const assetService = new services.AssetsService({ schema, knex: database, accountability });
    const sudoService = new services.ItemsService<File & { thumbhash: string }>("directus_files", {
      schema,
      knex: database,
    });

    const result = await assetService.getAsset(key);

    const { data, info } = await result.stream.pipe(
      sharp()
        .resize({
          width: 100,
          height: 100,
          fit: "inside",
        }).ensureAlpha().raw(),
    )
      .toBuffer({
        resolveWithObject: true,
      });

    const bytes = rgbaToThumbHash(info.width, info.height, data);

    await sudoService.updateOne(key, {
      thumbhash: Buffer.from(bytes).toString("base64"),
    });

    logger.info(`Thumbhash was successfully created!`);
  });
});
