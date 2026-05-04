require 'json'

package = JSON.parse(File.read(File.join(__dir__, 'package.json')))

Pod::Spec.new do |s|
  s.name         = 'legato-react-native'
  s.version      = package['version']
  s.summary      = package['description']
  s.description  = package['description']
  s.license      = package['license']
  s.author       = package['author']
  s.homepage     = package['homepage']
  s.platforms    = { :ios => '15.1', :tvos => '15.1' }
  s.swift_version = '5.4'
  s.source       = { git: 'https://github.com/ddgutierrezc/legato.git' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.dependency 'LegatoCore'

  s.source_files = 'ios/LegatoModule.swift'
end
