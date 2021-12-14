import cdk = require("@aws-cdk/core");
import ec2 = require("@aws-cdk/aws-ec2");
import lambda = require("@aws-cdk/aws-lambda");

import * as apigw from "@aws-cdk/aws-apigateway";
import * as iam from "@aws-cdk/aws-iam";
import * as path from "path";

import { NodejsFunction } from "@aws-cdk/aws-lambda-nodejs";

export class StockServiceStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // create the vpc with one private subnets in two AZs
    const vpc: ec2.Vpc = new ec2.Vpc(this, "stock-vpc", {
      cidr: "10.0.0.0/16",
      natGateways: 0,
      maxAzs: 2,
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: "private-subnet-1",
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
        },
      ],
    });

    // create the 'check-stock' lambda
    const handler: NodejsFunction = new NodejsFunction(this, "get-stock", {
      functionName: "check-stock",
      runtime: lambda.Runtime.NODEJS_14_X,
      entry: path.join(__dirname, "/../stock/get-stock/get-stock.ts"),
      memorySize: 1024,
      handler: "handler",
      vpc: vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
      },
      bundling: {
        minify: true,
        externalModules: ["aws-sdk"],
      },
      environment: {
        REGION: cdk.Stack.of(this).region,
        AVAILABILITY_ZONES: JSON.stringify(
          cdk.Stack.of(this).availabilityZones
        ),
      },
    });

    // add the resource policy for the private api
    const apiResourcePolicy: iam.PolicyDocument = new iam.PolicyDocument({
      statements: [
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ["execute-api:Invoke"],
          principals: [new iam.AnyPrincipal()],
          resources: ["execute-api:/*/*/*"], //this will automatically populate on deploy
        }),
        new iam.PolicyStatement({
          effect: iam.Effect.DENY,
          principals: [new iam.AnyPrincipal()],
          actions: ["execute-api:Invoke"],
          resources: ["execute-api:/*/*/*"], //this will automatically populate on deploy
          conditions: {
            StringNotEquals: {
              "aws:SourceVpce": "vpce-0d9643ccd883bac3a", // this needs to be the correct vpce in the other account
            },
          },
        }),
      ],
    });

    // create the private api for the stock platform
    const api: apigw.RestApi = new apigw.RestApi(this, "stock-platform-api", {
      restApiName: "stock-platform-api",
      endpointConfiguration: {
        types: [apigw.EndpointType.PRIVATE],
      },
      policy: apiResourcePolicy,
    });

    // create a rate limit key for the usage plan
    const key: apigw.RateLimitedApiKey = new apigw.RateLimitedApiKey(
      this,
      "orders-rate-limited-api-key",
      {
        enabled: true,
        apiKeyName: "orders-rate-limited-api-key",
        description: "orders-rate-limited-api-key",
        customerId: "orders-api",
        value: "super-secret-api-key",
        generateDistinctId: false,
        resources: [api],
        quota: {
          limit: 500,
          period: apigw.Period.DAY,
        },
      }
    );

    // add a usage plan for the api
    const plan: apigw.UsagePlan = api.addUsagePlan("orders-usage-plan", {
      name: "orders-usage-plan",
      throttle: {
        rateLimit: 10,
        burstLimit: 2,
      },
    });

    plan.addApiKey(key);

    // add a lambda integration to the api
    const getStockLambda: apigw.LambdaIntegration = new apigw.LambdaIntegration(
      handler,
      {
        allowTestInvoke: true,
      }
    );

    // add the stock resources to the api
    const stock: apigw.Resource = api.root.addResource("stock");
    const stockMethod: apigw.Method = stock.addMethod("GET", getStockLambda, {
      authorizationType: apigw.AuthorizationType.NONE,
      apiKeyRequired: true,
    });

    // and the api stage
    plan.addApiStage({
      stage: api.deploymentStage,
      throttle: [
        {
          method: stockMethod,
          throttle: {
            rateLimit: 10,
            burstLimit: 2,
          },
        },
      ],
    });

    new cdk.CfnOutput(this, "StockEndpointUrl", {
      value: `${api.url}stock`,
      exportName: "StockEndpointUrl",
    });
  }
}
