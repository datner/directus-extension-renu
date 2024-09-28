import type { AssetsService, ItemsService } from "@directus/api/dist/services";
import type { TransformationParams } from "@directus/api/dist/types";
import { defineHook } from "@directus/extensions-sdk";
import type { File } from "@directus/types";
import { rgbaToThumbHash } from "thumbhash";

function resizeImage(
  originalWidth: number,
  originalHeight: number,
  maxWidth: number = 100,
  maxHeight: number = 100,
): { width: number; height: number } {
  // Calculate the aspect ratio
  const aspectRatio = originalWidth / originalHeight;

  // Initialize new dimensions
  let newWidth = originalWidth;
  let newHeight = originalHeight;

  // Check if the width exceeds the maximum width
  if (newWidth > maxWidth) {
    newWidth = maxWidth;
    newHeight = newWidth / aspectRatio;
  }

  // Check if the height exceeds the maximum height
  if (newHeight > maxHeight) {
    newHeight = maxHeight;
    newWidth = newHeight * aspectRatio;
  }

  return {
    width: Math.round(newWidth),
    height: Math.round(newHeight),
  };
}
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

    const transformationParams: TransformationParams = {
      withoutEnlargement: true,
      fit: "inside",
      format: "jpg",
      quality: 30,
      width: 100,
      height: 100,
    };

    const result = await assetService.getAsset(
      key,
      { transformationParams },
    );

    const file = result.file as File;

    const contents = await result.stream.toArray().then(Buffer.concat);
    const meta = resizeImage(file.width!, file.height!);

    const bytes = rgbaToThumbHash(meta.width, meta.height, contents);

    await sudoService.updateOne(key, {
      thumbhash: Buffer.from(bytes).toString("base64"),
    });

    logger.info(`Thumbhash was successfully created!`);
  });
});
