const fs = require('fs-extra');
const path = require('path');
const { JSDOM } = require('jsdom');
const fetch = require('node-fetch');
const glob = require('glob');
const sh = require('shorthash');
const fileType = require('file-type');

let config = {
  distPath: '_site',
  verbose: false,
  attribute: 'src',
  useExisting: false,
};

const downloadImage = async path => {
  if (config.verbose) {
    console.log('eleventy-plugin-local-images: Attempting to copy ' + path);
  }

  try {
    const imgBuffer = await fetch(path)
      .then(res => {
        if (res.status == 200) {
          return res;
        } else {
          throw new Error(`File "${path}" not found`);
        }
      })
      .then(res => res.buffer());
    return imgBuffer;
  } catch (error) {
    console.log(error);
  }
};

const getFileType = (filename, buffer) => {
  // infer the file ext from the buffer
  const type = fileType(buffer);

  if (type.ext) {
    // return the filename with extension
    return `${filename}.${type.ext}`;
  } else {
    throw new Error(`Couldn't infer file extension for "${path}"`);
  }
};

const processImage = async img => {
  let { distPath, assetPath, attribute } = config;

  const external = /https?:\/\/((?:[\w\d-]+\.)+[\w\d]{2,})/i;
  const imgPath = img.getAttribute(attribute);

  if (external.test(imgPath)) {
    try {
      // get the filname from the path
      const pathComponents = imgPath.split('/');
      let filename = pathComponents[pathComponents.length - 1];
      const extname = path.extname(filename);

      // generate a unique short hash based on the original file path
      // this will prevent filename clashes
      const hash = sh.unique(imgPath);

      if (config.useExisting) {
        const globFilename = extname
          ? `${hash}-${filename}.${extname}`
          : `${hash}-${filename}*`;
        const globPath = path.join(distPath, assetPath, globFilename);

        const files = glob.sync(globPath);
        if (files.length) {
          console.log(
            `eleventy-plugin-local-images: Found existing ${files[0]}`
          );

          img.setAttribute(
            attribute,
            path.join(assetPath, path.basename(files[0]))
          );

          return img;
        }
      }

      // image is external so download it.
      let imgBuffer = await downloadImage(imgPath);
      if (imgBuffer) {
        // check if the remote image has a file extension and then hash the filename
        const hashedFilename = extname
          ? `${hash}-${filename}`
          : `${hash}-${getFileType(filename, imgBuffer)}`;

        // create the file path from config
        let outputFilePath = path.join(distPath, assetPath, hashedFilename);

        // save the file out, and log it to the console
        await fs.outputFile(outputFilePath, imgBuffer);
        if (config.verbose) {
          console.log(
            `eleventy-plugin-local-images: Saving ${filename} to ${outputFilePath}`
          );
        }

        // Update the image with the new file path
        img.setAttribute(attribute, path.join(assetPath, hashedFilename));
      }
    } catch (error) {
      console.log(error);
    }
  }

  return img;
};

const grabRemoteImages = async (rawContent, outputPath) => {
  let { selector = 'img' } = config;
  let content = rawContent;

  if (outputPath.endsWith('.html')) {
    const dom = new JSDOM(content);
    const images = [...dom.window.document.querySelectorAll(selector)];

    if (images.length > 0) {
      await Promise.all(images.map(i => processImage(i)));
      content = dom.serialize();
    }
  }

  return content;
};

module.exports = {
  initArguments: {},
  configFunction: async (eleventyConfig, pluginOptions = {}) => {
    config = Object.assign({}, config, pluginOptions);

    // check the required config is present
    if (!config.assetPath || !config.distPath) {
      throw new Error(
        'eleventy-plugin-local-images requires that assetPath and distPath are set'
      );
    }

    eleventyConfig.addTransform('localimages', grabRemoteImages);
  },
};