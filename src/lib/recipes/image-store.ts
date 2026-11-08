/**
 * A recipe's original images, kept on the server. The calls live in recipe-api.ts;
 * these names are what the pages use.
 */
export { uploadImage, fetchImage as loadImage, deleteImage as removeImage } from './recipe-api';
