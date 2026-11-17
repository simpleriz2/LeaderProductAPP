import {createIndexedDbDriver} from '../../database/indexedDbDriver.web';
import {createDatabaseSession} from '../../database/moduleDatabase';
import {prepareDataGeneration} from '../../database/migrations';
import {createGenerationFence} from '../../database/generationFence';
import {createWebGenerationLock} from '../../database/generationLock.web';
// Test-only bundle. Never imported by the product entrypoints.
import {openWebReleaseStorage} from '../../adapters/releaseStorage.web';
import {createWebTrust} from '../../adapters/trust.web';
import {stageAndActivate,verifyRelease,artifactFiles} from '../../core/releaseSet';
import {bootstrapRelease,confirmReleaseHealthy,recoverLastHealthy} from '../../core/releaseBootstrap';
Object.assign(globalThis,{LP2:{createGenerationFence,createWebGenerationLock,createIndexedDbDriver,createDatabaseSession,prepareDataGeneration,openWebReleaseStorage,createWebTrust,stageAndActivate,verifyRelease,artifactFiles,bootstrapRelease,confirmReleaseHealthy,recoverLastHealthy}});
