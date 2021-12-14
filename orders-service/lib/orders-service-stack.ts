import cdk = require("@aws-cdk/core");
import ec2 = require("@aws-cdk/aws-ec2");
import lambda = require("@aws-cdk/aws-lambda");

import * as apigw from "@aws-cdk/aws-apigatewayv2";
import * as path from "path";

import { HttpMethod } from "@aws-cdk/aws-apigatewayv2";
import { LambdaProxyIntegration } from "@aws-cdk/aws-apigatewayv2-integrations";
import { NodejsFunction } from "@aws-cdk/aws-lambda-nodejs";

export class OrdersServiceStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // create the vpc with one private subnets in two AZs
    const vpc: ec2.Vpc = new ec2.Vpc(this, "order-vpc", {
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

    // create the 'create-order' lambda
    const handler: NodejsFunction = new NodejsFunction(this, "create-order", {
      functionName: "create-order",
      runtime: lambda.Runtime.NODEJS_14_X,
      entry: path.join(__dirname, "/../orders/create-order/create-order.ts"),
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

    // create an http api with a lambda proxy
    const httpApi: apigw.HttpApi = new apigw.HttpApi(this, "orders-http-api");
    const createOrderLambdaIntegration = new LambdaProxyIntegration({
      handler: handler,
    });

    // add an orders route
    httpApi.addRoutes({
      path: "/orders",
      methods: [HttpMethod.POST],
      integration: createOrderLambdaIntegration,
    });

    // add a security group for the vpc endpoint
    const sg: ec2.SecurityGroup = new ec2.SecurityGroup(this, "orders-vpc-sg", {
      vpc,
      allowAllOutbound: true,
      securityGroupName: "orders-vpc-sg",
    });

    sg.addIngressRule(ec2.Peer.ipv4("10.0.0.0/16"), ec2.Port.tcp(443));

    // create the vpc endpoint
    const vpcEndpoint: ec2.InterfaceVpcEndpoint = new ec2.InterfaceVpcEndpoint(
      this,
      "orders-api-vpc-endpoint",
      {
        vpc,
        service: {
          name: "com.amazonaws.eu-west-1.execute-api",
          port: 443,
        },
        subnets: vpc.selectSubnets({
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
        }),
        privateDnsEnabled: true,
        securityGroups: [sg],
      }
    );

    // add some outputs to use later
    new cdk.CfnOutput(this, "OrdersEndpointUrl", {
      value: `${httpApi.url}orders`,
      exportName: "OrdersEndpointUrl",
    });

    new cdk.CfnOutput(this, "OrdersVPCEndpointId", {
      value: vpcEndpoint.vpcEndpointId,
      exportName: "OrdersVPCEndpointId",
    });
  }
}
