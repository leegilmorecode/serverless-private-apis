#!/usr/bin/env node

import "source-map-support/register";

import * as cdk from "@aws-cdk/core";

import { OrdersServiceStack } from "../lib/orders-service-stack";

const app = new cdk.App();
new OrdersServiceStack(app, "orders-service-stack", {});
