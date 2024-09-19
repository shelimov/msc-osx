import { $ as $$, question, fs, cd, syncProcessCwd, echo, spinner } from 'zx'

const $ = $$({
  // verbose: true,
  nothrow: true,
})

const MSC_APP_ID = '516750'
const MSC_DEPOT_ID = '516751'
const MSC_BUILD_ID = '12922607'
const MSC_MANIFEST_ID = '334631432900238181'
const MSC_PATH = `depots/${MSC_DEPOT_ID}/${MSC_BUILD_ID}`

const UNITY_PLAYER_VERSION = '5.0.0f4'
const UNITY_PLAYER_DOWNLOAD_HASH = '5b98b70ebeb9'
const UNITY_PLAYER_HASH = '586029ed099dac2b84c7b382001ec39c'
const UNITY_PLAYER_FOLDER = `Unity-${UNITY_PLAYER_VERSION}`
const UNITY_PLAYER_PKG_PATH = `${UNITY_PLAYER_FOLDER}.pkg`

const DEPOT_DOWNLOADER_VERSION = '2.7.1'
const DEPOT_DOWNLOADER_ARCH = 'arm64'
const DEPOT_DOWNLOADER_HASH = '8b938b27a1796baac43a6084c5f0ea15'
const DEPOT_DOWNLOADER_FOLDER_NAME = `depotdownloader-${DEPOT_DOWNLOADER_VERSION}-macos-${DEPOT_DOWNLOADER_ARCH}`
const DEPOT_DOWNLOADER_EXECUTABLE_PATH = `${DEPOT_DOWNLOADER_FOLDER_NAME}/DepotDownloader`

const VENDOR_PATH = 'vendors'
const VENDOR_STEAMWORKS_URL =
  'https://github.com/rlabrecque/Steamworks.NET/releases/download/10.0.0/Steamworks.NET-Standalone_10.0.0.zip'
const VENDOR_STEAMWORKS_PATH = `${VENDOR_PATH}/steamworks`

const OUTPUT_DIR = 'build'
const OUTPUT_APP_PATH = `${OUTPUT_DIR}/MySummerCar.app`

function exit(status) {
  $`exit ${status}`
}

async function prompt(questionStr, yesByDefault = true) {
  const response = await question(questionStr + ' [Yn] ')

  if (yesByDefault && response === '') {
    return true
  }

  return response.toLowerCase() === 'y'
}

async function verifyHash(filePath, hash) {
  const [fileHash] = (await $`md5 -q ${filePath}`).lines()
  if (fileHash !== hash) {
    echo(
      `The file ${filePath} may be corrupted: md5 hash ${fileHash} != ${hash} (expected)`,
    )
    if (!(await prompt('Do you still want to continue? (not recommended)'))) {
      exit(1)
    }
  }
}

async function ensureDepotDownloader() {
  if (!(await fs.pathExists(`./${DEPOT_DOWNLOADER_EXECUTABLE_PATH}`))) {
    const shouldDownloadDepotDownloader = await prompt(
      `Download (~80MB) and unzip DepotDownloader (${DEPOT_DOWNLOADER_ARCH}) to download MSC from Steam?`,
    )

    if (shouldDownloadDepotDownloader) {
      const zipFileName = `${DEPOT_DOWNLOADER_FOLDER_NAME}.zip`
      await $`curl -L https://github.com/SteamRE/DepotDownloader/releases/download/DepotDownloader_${DEPOT_DOWNLOADER_VERSION}/depotdownloader-macos-${DEPOT_DOWNLOADER_ARCH}.zip -o ${zipFileName}`
      await verifyHash(zipFileName, DEPOT_DOWNLOADER_HASH)
      await $`unzip ${zipFileName} -d ${DEPOT_DOWNLOADER_FOLDER_NAME}`
      await $`rm ${zipFileName}`

      await $`xattr -c ${DEPOT_DOWNLOADER_EXECUTABLE_PATH}`
      await $`chmod u+x ${DEPOT_DOWNLOADER_EXECUTABLE_PATH}`
    } else {
      exit(1)
    }
  }
}

async function ensureAssets() {
  if (!(await fs.pathExists(`./${MSC_PATH}`))) {
    const shouldDownloadAssets = await prompt(
      'Download My Summer Car (~900mb) from Steam?',
    )

    if (shouldDownloadAssets) {
      await ensureDepotDownloader()
      const userName = await question('Steam username: ')
      await $`${DEPOT_DOWNLOADER_EXECUTABLE_PATH} -app ${MSC_APP_ID} -depot ${MSC_DEPOT_ID} -manifest ${MSC_MANIFEST_ID} -os windows -username ${userName}`
    } else {
      exit(1)
    }
  }
}

async function ensureUnityPlayer() {
  if (!(await fs.pathExists(`./${UNITY_PLAYER_FOLDER}`))) {
    if (!(await fs.pathExists(`./${UNITY_PLAYER_PKG_PATH}`))) {
      const shouldDownloadUnityPlayer = await prompt(
        `Download Unity Player v${UNITY_PLAYER_VERSION} (~1.6gb)?`,
      )

      if (shouldDownloadUnityPlayer) {
        await $`curl -L https://download.unity3d.com/download_unity/${UNITY_PLAYER_DOWNLOAD_HASH}/MacEditorInstaller/Unity-${UNITY_PLAYER_VERSION}.pkg -o Unity-${UNITY_PLAYER_VERSION}.pkg`
      } else {
        exit(1)
      }
    }

    await spinner('Verifying unity player package hash...', () =>
      verifyHash(UNITY_PLAYER_PKG_PATH, UNITY_PLAYER_HASH),
    )

    await spinner(
      'Unpacking unity player...',
      () =>
        $`pkgutil --expand-full ${UNITY_PLAYER_PKG_PATH} ${UNITY_PLAYER_FOLDER}`,
    )
  }
}

async function ensureVendors() {
  await fs.ensureDir('vendors')
  if (!(await fs.pathExists(`./${VENDOR_STEAMWORKS_PATH}`))) {
    await $`curl -L ${VENDOR_STEAMWORKS_URL} -o ${VENDOR_STEAMWORKS_PATH}.zip`
    await $`unzip ${VENDOR_STEAMWORKS_PATH}.zip -d ${VENDOR_STEAMWORKS_PATH}`
  }
}

async function acquireUnityVersion() {
  return (
    await $`strings ${MSC_PATH}/mysummercar_Data/level0 | head -1`
  ).lines()[0]
}

async function main() {
  syncProcessCwd()

  await fs.ensureDir('source')
  cd('source')
  await ensureAssets()
  const gameUnityVersion = await acquireUnityVersion()
  if (gameUnityVersion !== UNITY_PLAYER_VERSION) {
    echo(
      `FATAL ERROR: Current assets unity version is ${gameUnityVersion}, but this build is configured to work only with ${UNITY_PLAYER_VERSION}.`,
    )
    echo(`FATAL ERROR: Script update is required!`)
  }
  await ensureUnityPlayer()
  await ensureVendors()

  await fs.ensureDir(`../${OUTPUT_DIR}`)
  await $`rm -rf ../${OUTPUT_DIR}/*`
  await $`cp -r ${UNITY_PLAYER_FOLDER}/Unity.pkg.tmp/Payload/Unity/Unity.app/Contents/PlaybackEngines/MacStandaloneSupport/Variations/macosx64_nondevelopment_mono/UnityPlayer.app ../${OUTPUT_APP_PATH}`
  await $`cp -r ${MSC_PATH}/mysummercar_Data ../${OUTPUT_APP_PATH}/Contents/Resources/Data`
  await $`cp -r ${VENDOR_STEAMWORKS_PATH}/OSX-Linux-x64/CSteamworks.bundle ../${OUTPUT_APP_PATH}/Contents/Resources/Data/Plugins`
  await $`echo "${MSC_APP_ID}" > ../${OUTPUT_APP_PATH}/Contents/MacOS/steam_appid.txt`

  cd(`../${OUTPUT_APP_PATH}`)
  await $`cp -r Contents/Resources/Data/Plugins Contents`
  await $`cp -r Contents/Resources/Data/Resources/* Contents/Resources`
}

await main()
