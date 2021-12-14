#!/usr/bin/env node

import "source-map-support/register";

import * as cdk from "@aws-cdk/core";

import { StockServiceStack } from "../lib/stock-service-stack";

const app = new cdk.App();
new StockServiceStack(app, "stock-service-stack", {});
