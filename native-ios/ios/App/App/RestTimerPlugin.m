//
//  RestTimerPlugin.m
//  Registers RestTimerPlugin with the Capacitor bridge so the web app can reach
//  it at window.Capacitor.Plugins.RestTimer. Each CAP_PLUGIN_METHOD here must
//  match an @objc func in RestTimerPlugin.swift.
//

#import <Foundation/Foundation.h>
#import <Capacitor/Capacitor.h>

CAP_PLUGIN(RestTimerPlugin, "RestTimer",
    CAP_PLUGIN_METHOD(start, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(update, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(stop, CAPPluginReturnPromise);
)
