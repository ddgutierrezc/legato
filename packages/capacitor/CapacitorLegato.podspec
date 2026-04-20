require 'json'

package = JSON.parse(File.read(File.join(__dir__, 'package.json')))

Pod::Spec.new do |s|
  s.name = 'CapacitorLegato'
  s.version = package['version']
  s.summary = package['description']
  s.license = package['license']
  s.homepage = package['homepage'] || 'https://github.com/legato/legato'
  s.author = package['author'] || 'Legato'
  s.source = {
    :git => 'https://github.com/legato/legato.git',
    :tag => "#{package['name']}@#{package['version']}"
  }
  s.source_files = 'ios/Sources/**/*.{swift,h,m,c,cc,mm,cpp}'
  s.ios.deployment_target = '15.0'
  s.dependency 'Capacitor'
  s.swift_version = '5.9'
end
