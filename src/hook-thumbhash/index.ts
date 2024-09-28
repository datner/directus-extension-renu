import type { AssetsService, FilesService, ItemsService } from "@directus/api/dist/services";
import type { TransformationParams } from "@directus/api/dist/types";
import { getMetadata } from "@directus/api/services/files/utils/get-metadata";
import { defineHook } from "@directus/extensions-sdk";
import { PassThrough } from "stream";
import { rgbaToThumbHash } from "thumbhash";

export default defineHook(({ action }, ctx) => {
  const services = ctx.services as {
    ItemsService: typeof ItemsService;
    AssetsService: typeof AssetsService;
    FilesService: typeof FilesService;
  };
  const logger = ctx.logger.child({ extension: "Thumbhash" });

  action("files.upload", async ({ payload, key }, { schema, database, accountability }) => {
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

    const transformationParams: TransformationParams = {
      withoutEnlargement: true,
      format: "jpg",
      quality: 30,
    };
    if (payload.width >= payload.height) {
      transformationParams.width = 100;
    } else {
      transformationParams.height = 100;
    }

    const result = await assetService.getAsset(
      key,
      { transformationParams },
    );

    const stream1 = new PassThrough(),
      stream2 = new PassThrough();

    result.stream.pipe(stream1);
    result.stream.pipe(stream2);

    const [meta, contents] = await Promise.all(
      [getMetadata(stream1), stream2.toArray().then(Buffer.concat)],
    );

    const bytes = rgbaToThumbHash(meta.width!, meta.height!, contents);

    await sudoService.updateOne(key, {
      thumbhash: Buffer.from(bytes).toString("base64"),
    });

    logger.info(`Thumbhash was successfully created!`);
  });
});
