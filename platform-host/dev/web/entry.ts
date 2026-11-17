import {bindAuthorizedGeneration} from '../../database/authorizedGeneration';
import {ServiceRouter} from '../../core/serviceRouter';
import {createWebHttpTransport} from '../../adapters/http.web';
import {openWebSessionStore,bindWebSessionInvalidation,createWebSessionAuthority} from '../../adapters/offlineSession.web';
import {SessionCoordinator} from '../../core/sessionCoordinator';
import {openVerifiedWebFederation} from '../../adapters/federation.web';
import React from 'react';
import {createRoot} from 'react-dom/client';
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
Object.assign(globalThis,{LP2:{bindAuthorizedGeneration,ServiceRouter,createWebHttpTransport,openWebSessionStore,bindWebSessionInvalidation,createWebSessionAuthority,SessionCoordinator,openVerifiedWebFederation,React,createRoot,createGenerationFence,createWebGenerationLock,createIndexedDbDriver,createDatabaseSession,prepareDataGeneration,openWebReleaseStorage,createWebTrust,stageAndActivate,verifyRelease,artifactFiles,bootstrapRelease,confirmReleaseHealthy,recoverLastHealthy}});
