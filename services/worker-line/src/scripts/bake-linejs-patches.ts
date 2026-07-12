import { patchLinejsQrE2EELogin } from "../line/patch-linejs-login.js";
import { patchLinejsLtsmE2EE } from "../line/patch-linejs-e2ee.js";
import { patchLinejsListenSafeDecrypt } from "../line/patch-linejs-listen.js";

patchLinejsQrE2EELogin();
patchLinejsLtsmE2EE();
patchLinejsListenSafeDecrypt();
