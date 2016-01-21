name := """route-builder"""

version := "1.0-SNAPSHOT"

lazy val root = (project in file(".")).enablePlugins(PlayJava)

scalaVersion := "2.11.1"

libraryDependencies ++= Seq(
  javaJdbc,
  javaEbean,
  cache,
  javaWs,
  "org.opentripplanner" % "otp" % "0.18.0" exclude("org.slf4j", "slf4j-simple"),
  "com.vividsolutions" % "jts" % "1.13",
  "crosby.binary" % "osmpbf" % "1.2.1"
)

resolvers += "Conveyal Maven Repository" at "http://maven.conveyal.com"
